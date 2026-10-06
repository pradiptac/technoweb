<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreFormRequest;
use App\Http\Requests\UpdateFormRequest;
use App\Http\Resources\FormResource;
use App\Http\Resources\FormSubmissionResource;
use App\Models\Form;
use App\Models\FormField;
use App\Models\FormSubmission;
use App\Models\Lead;
use App\Support\Forms\AnswerText;
use App\Support\Forms\FieldSpec;
use App\Support\Newsletter\Csv;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class FormController extends Controller
{
    /**
     * `meta` carries the builder's vocabulary — the kinds, the condition
     * operators, what a file field may accept and how large an upload this
     * server takes — so the console draws its palette from the API's list
     * rather than keeping one of its own. On the index as well as the read,
     * because the console's *new* screen has no record to read them from.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $forms = Form::query()
            ->withCount(['fields', 'submissions'])
            ->when($request->filled('q'), fn ($q) => $q->where('name', 'like', '%'.$request->string('q')->value().'%'))
            ->orderBy('name')
            ->paginate(min($request->integer('per_page', 25), 100))
            ->withQueryString();

        return FormResource::collection($forms)->additional(['meta' => FieldSpec::meta()]);
    }

    public function store(StoreFormRequest $request): JsonResponse
    {
        $data = $request->validated();
        $fields = $data['fields'] ?? null;
        unset($data['fields']);

        $form = Form::create($data);
        $this->syncFields($form, $fields);

        return (new FormResource($form->load('fields')))
            ->additional(['meta' => FieldSpec::meta()])
            ->response()
            ->setStatusCode(201);
    }

    public function show(Form $form): JsonResource
    {
        return (new FormResource($form->load('fields')->loadCount('submissions')))
            ->additional(['meta' => FieldSpec::meta()]);
    }

    public function update(UpdateFormRequest $request, Form $form): JsonResource
    {
        $data = $request->validated();
        $fields = array_key_exists('fields', $data) ? ($data['fields'] ?? []) : null;
        unset($data['fields']);

        $form->update($data);
        $this->syncFields($form, $fields);

        return (new FormResource($form->load('fields')))->additional(['meta' => FieldSpec::meta()]);
    }

    public function destroy(Form $form): JsonResponse
    {
        // Submissions survive — `form_id` is nullOnDelete and carries the slug
        // alongside it. Deleting a form must not destroy what people sent
        // through it, and that includes what they uploaded: no model event
        // fires for a submission here, so its files stay on the private disk
        // with it.
        $form->delete();

        return response()->json(null, 204);
    }

    /** Submissions for one form, newest first. */
    public function submissions(Request $request, Form $form): AnonymousResourceCollection
    {
        $rows = $form->submissions()
            ->latest()
            ->latest('id')
            ->paginate(min($request->integer('per_page', 25), 100))
            ->withQueryString();

        return FormSubmissionResource::collection($rows);
    }

    /**
     * One uploaded file, under the name it arrived with.
     *
     * The only way to read one. The file is on the private disk under a
     * hashed name and no response ever carries its path; this route sits in
     * the forms' own role group, so whoever may read a form's submissions may
     * read what came with them and nobody else can.
     *
     * 404 for a submission that belongs to another form — the id in the URL
     * is a number anybody can change — and for a field that has no file.
     * `attachment`, never inline: it was sent by a stranger, and a PDF or an
     * image opened in the console's own origin is a document running there.
     */
    public function file(Form $form, FormSubmission $submission, string $field): StreamedResponse
    {
        abort_unless($submission->form_id === $form->id, 404);

        $file = $submission->upload($field);

        abort_if($file === null, 404);

        $disk = Storage::disk(FormSubmission::DISK);

        abort_unless($disk->exists($file['path']), 404);

        return $disk->download(
            $file['path'],
            $file['name'],
            // No `Content-Disposition` of our own: `download()` builds the
            // attachment header *with* the filename, and a caller's value
            // replaces that whole header rather than adding to it.
            ['X-Content-Type-Options' => 'nosniff'],
        );
    }

    /**
     * Every submission to this form, as a file.
     *
     * One row per submission and one column per field that has an answer, in
     * the form's own order, between when it arrived and where from. Streamed
     * rather than assembled in memory, and written by `Csv::write` — the one
     * CSV writer in this application — so a cell beginning `=`, `+`, `-` or
     * `@` is escaped: these are answers typed by strangers into a public
     * form, opened by somebody in Excel, which is precisely the pair CSV
     * injection needs.
     *
     * The columns are today's fields. An answer to a field that has since
     * been removed is still in the submission and in the console, and is not
     * in this file — a column per key ever used would make the heading row
     * depend on the data.
     */
    public function export(Form $form): StreamedResponse
    {
        $fields = $form->load('fields')->valueFields();

        $headers = ['Submitted at', ...$fields->map(fn (FormField $f) => (string) $f->label)->all(), 'Source page', 'IP'];

        $rows = function () use ($form, $fields) {
            $before = PHP_INT_MAX;

            // Newest first, the order the console lists them in; paged by id
            // so a submission arriving mid-download cannot shift a page.
            do {
                $page = $form->submissions()->where('id', '<', $before)->orderByDesc('id')->limit(500)->get();

                /*
                 * Where each came from. A submission does not record its own
                 * page — the lead made from it does (`LeadIntake`), from the
                 * envelope the browser posted — so the column is read from
                 * there, one query a page.
                 */
                $sources = Lead::query()
                    ->where('source_type', (new FormSubmission)->getMorphClass())
                    ->whereIn('source_id', $page->modelKeys())
                    ->get(['source_id', 'source_url', 'source_path'])
                    ->keyBy('source_id');

                foreach ($page as $submission) {
                    $source = $sources->get($submission->id);

                    yield [
                        $submission->created_at?->toDateTimeString(),
                        // "; " between choices: the comma is the file's own.
                        ...$fields->map(fn (FormField $f) => AnswerText::for($f, $submission->data[$f->name] ?? null, '; ', 5000))->all(),
                        $source?->source_url ?: $source?->source_path,
                        $submission->ip_address,
                    ];

                    $before = $submission->id;
                }
            } while ($page->count() === 500);
        };

        return response()->streamDownload(function () use ($headers, $rows) {
            $handle = fopen('php://output', 'w');

            Csv::write($handle, $headers, $rows());

            fclose($handle);
        }, 'form-'.$form->slug.'-'.now()->format('Y-m-d').'.csv', ['Content-Type' => 'text/csv']);
    }

    /**
     * Delete one submission, and whatever was uploaded with it.
     *
     * The files go through the model's `deleting` hook, so this is the same
     * removal whoever calls it. The lead made from the submission stays: it
     * is the sales desk's record, it snapshot the contact when it was made,
     * and it has a delete of its own — the mirror of "deleting a lead keeps
     * the submission".
     */
    public function destroySubmission(Form $form, FormSubmission $submission): JsonResponse
    {
        abort_unless($submission->form_id === $form->id, 404);

        $submission->delete();

        return response()->json(null, 204);
    }

    /**
     * Replaced wholesale, like every other repeater here.
     *
     * Deleting and recreating rather than diffing: a field's identity is its
     * `name`, the unique index is on (form_id, name), and an editor renaming
     * one is indistinguishable from deleting it and adding another. Submissions
     * already hold their own copy of the data, so nothing is lost.
     *
     * Each row is reduced to what its kind keeps (`FieldSpec`): options only
     * where there is a list to choose from, `settings` to that kind's own
     * keys, and no `required` on a row that cannot be answered — a hidden
     * value, a heading, a step break.
     */
    private function syncFields(Form $form, ?array $fields): void
    {
        if ($fields === null) {
            return;
        }

        $form->fields()->delete();

        $fields = array_values($fields);
        $taken = array_flip(array_filter(array_column($fields, 'name'), 'is_string'));
        $step = 1;

        foreach ($fields as $i => $field) {
            $kind = $field['kind'] ?? 'text';
            $layout = FieldSpec::isLayout($kind);
            $name = $field['name'] ?? null;

            if (blank($name)) {
                // A heading and a step break have no answer to key, so the
                // server names them — the column is unique per form and not
                // nullable, and nothing ever reads the name back as a value.
                $name = $this->freeName($kind === 'step' ? 'step' : 'section', $taken);
            }

            if ($kind === 'step') {
                $step++;
            }

            $form->fields()->create([
                'kind' => $kind,
                'name' => $name,
                'label' => filled($field['label'] ?? null) ? $field['label'] : 'Step '.$step,
                'placeholder' => $field['placeholder'] ?? null,
                'help' => $field['help'] ?? null,
                'required' => ! $layout && $kind !== 'hidden' && ($field['required'] ?? false),
                'options' => in_array($kind, FieldSpec::WITH_OPTIONS, true) ? ($field['options'] ?? null) : null,
                'settings' => FieldSpec::settings($kind, $field['settings'] ?? null),
                'show_if' => FieldSpec::showIf($field['show_if'] ?? null),
                'width' => $field['width'] ?? 'full',
                'sort_order' => $i,
            ]);
        }
    }

    /** @param  array<string, mixed>  $taken */
    private function freeName(string $base, array &$taken): string
    {
        for ($n = 1; isset($taken["{$base}_{$n}"]); $n++) {
            //
        }

        $taken["{$base}_{$n}"] = true;

        return "{$base}_{$n}";
    }
}
