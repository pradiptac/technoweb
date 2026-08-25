<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreFormRequest;
use App\Http\Requests\UpdateFormRequest;
use App\Http\Resources\FormResource;
use App\Http\Resources\FormSubmissionResource;
use App\Models\Form;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;

class FormController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $forms = Form::query()
            ->withCount(['fields', 'submissions'])
            ->when($request->filled('q'), fn ($q) => $q->where('name', 'like', '%'.$request->string('q')->value().'%'))
            ->orderBy('name')
            ->paginate(min($request->integer('per_page', 25), 100))
            ->withQueryString();

        return FormResource::collection($forms);
    }

    public function store(StoreFormRequest $request): JsonResponse
    {
        $data = $request->validated();
        $fields = $data['fields'] ?? null;
        unset($data['fields']);

        $form = Form::create($data);
        $this->syncFields($form, $fields);

        return (new FormResource($form->load('fields')))->response()->setStatusCode(201);
    }

    public function show(Form $form): JsonResource
    {
        return new FormResource($form->load('fields')->loadCount('submissions'));
    }

    public function update(UpdateFormRequest $request, Form $form): JsonResource
    {
        $data = $request->validated();
        $fields = array_key_exists('fields', $data) ? ($data['fields'] ?? []) : null;
        unset($data['fields']);

        $form->update($data);
        $this->syncFields($form, $fields);

        return new FormResource($form->load('fields'));
    }

    public function destroy(Form $form): JsonResponse
    {
        // Submissions survive — `form_id` is nullOnDelete and carries the slug
        // alongside it. Deleting a form must not destroy what people sent
        // through it.
        $form->delete();

        return response()->json(null, 204);
    }

    /** Submissions for one form, newest first. */
    public function submissions(Request $request, Form $form): AnonymousResourceCollection
    {
        $rows = $form->submissions()
            ->latest()
            ->paginate(min($request->integer('per_page', 25), 100))
            ->withQueryString();

        return FormSubmissionResource::collection($rows);
    }

    /**
     * Replaced wholesale, like every other repeater here.
     *
     * Deleting and recreating rather than diffing: a field's identity is its
     * `name`, the unique index is on (form_id, name), and an editor renaming
     * one is indistinguishable from deleting it and adding another. Submissions
     * already hold their own copy of the data, so nothing is lost.
     */
    private function syncFields(Form $form, ?array $fields): void
    {
        if ($fields === null) {
            return;
        }

        $form->fields()->delete();

        foreach (array_values($fields) as $i => $field) {
            $form->fields()->create([
                'kind' => $field['kind'] ?? 'text',
                'name' => $field['name'],
                'label' => $field['label'],
                'placeholder' => $field['placeholder'] ?? null,
                'help' => $field['help'] ?? null,
                'required' => (bool) ($field['required'] ?? false),
                'options' => $field['options'] ?? null,
                'width' => $field['width'] ?? 'full',
                'sort_order' => $i,
            ]);
        }
    }
}
