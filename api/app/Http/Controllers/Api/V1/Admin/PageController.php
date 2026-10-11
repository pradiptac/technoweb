<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\AnswerBlockKind;
use App\Enums\PageSectionType;
use App\Enums\PublishStatus;
use App\Http\Controllers\Api\V1\Admin\Concerns\HandlesBulk;
use App\Http\Controllers\Concerns\WritesCmsEntities;
use App\Http\Controllers\Controller;
use App\Http\Requests\BulkActionRequest;
use App\Http\Requests\PreviewPageSectionsRequest;
use App\Http\Requests\SectionsFromBodyRequest;
use App\Http\Requests\StorePageRequest;
use App\Http\Requests\UpdatePageRequest;
use App\Http\Resources\Admin\PageResource;
use App\Models\ContentBlock;
use App\Models\DownloadCategory;
use App\Models\Form;
use App\Models\Gallery;
use App\Models\Page;
use App\Models\ProductCategory;
use App\Models\SavedSection;
use App\Models\Slider;
use App\Models\StoreCategory;
use App\Support\CustomFields\CustomFields;
use App\Support\PageSections\BodySections;
use App\Support\PageSections\LayoutRules;
use App\Support\PageSections\RecordSections;
use App\Support\PageSections\SectionPresenter;
use App\Support\PageSections\SectionPresets;
use App\Support\PageSections\SectionRules;
use App\Support\Seo\Ai\PageDraft;
use App\Support\Seo\Ai\SectionDraft;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Standalone page CRUD — privacy, terms, downloads and anything else that is
 * a page rather than a catalogue record. Behind role:content_manager.
 */
class PageController extends Controller
{
    use HandlesBulk;
    use WritesCmsEntities;

    public function index(Request $request): AnonymousResourceCollection
    {
        $pages = Page::query()
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = $request->string('q')->value();
                $q->where(fn ($w) => $w->where('title', 'like', "%{$term}%")
                    ->orWhere('slug', 'like', "%{$term}%"));
            })
            ->orderBy('title')
            ->paginate(min($request->integer('per_page', 30), 100))
            ->withQueryString();

        // Sent by the API, never listed in TypeScript: the console's kind
        // select is built from this, the `meta.transitions` rule.
        return PageResource::collection($pages)->additional(['meta' => [
            'answer_block_kinds' => AnswerBlockKind::options(),
            // The builder's section picker and "Start from" presets (2026-09-26).
            'section_types' => PageSectionType::options(),
            'section_presets' => SectionPresets::all(),
            // The custom field groups that apply, for the console's Fields tab.
            'custom_field_groups' => CustomFields::definitions('page'),
            // Whether "Draft with AI" can be pressed now, and the sentence
            // that says why not — the refusal the endpoint itself would give.
            'ai_draft' => ['available' => ($reason = PageDraft::refusal()) === null, 'reason' => $reason],
        ]]);
    }

    /**
     * A draft builder page laid out by the assistant from a brief (0.116.0):
     * `PageDraft` asks for sections, validates each as a save would and
     * creates a **draft**; the console opens it on the Builder tab. 201 with
     * the page and what was left out; 422 on `brief` with the assistant's own
     * sentence when it refuses. Nothing is published.
     */
    public function aiDraft(Request $request, PageDraft $draft): JsonResponse
    {
        $data = $request->validate([
            'brief' => ['required', 'string', 'min:10', 'max:1500'],
            'length' => ['nullable', 'string', 'in:short,standard,long'],
            'pictures' => ['sometimes', 'boolean'],
            'icons' => ['nullable', 'array', 'max:400'],
            'icons.*' => ['string', 'max:40'],
        ], [
            'brief.required' => 'Describe the page you want.',
            'brief.min' => 'Say a little more about the page — a sentence at least.',
            'brief.max' => 'Keep the brief to 1500 characters.',
        ]);

        $result = $draft->draft(
            (string) $data['brief'],
            (string) ($data['length'] ?? 'standard'),
            $request->boolean('pictures', true),
            (array) ($data['icons'] ?? []),
            $request->user()?->id,
        );

        if (! $result['ok'] || ! isset($result['page'])) {
            $error = $result['error'] ?? 'The AI service answered, but nothing in it was usable. Try again.';

            return response()->json(['message' => $error, 'errors' => ['brief' => [$error]]], 422);
        }

        $page = $result['page'];

        return response()->json(['data' => [
            'id' => $page->id,
            'title' => $page->title,
            'slug' => $page->slug,
            'admin_path' => '/admin/pages/'.$page->id.'?tab=builder',
            'sections' => count($page->blocks ?? []),
            'dropped' => $result['dropped'] ?? [],
        ]], 201);
    }

    /**
     * The assistant on one section of the builder (0.127.0): write its
     * wording from a brief, or reword, shorten or expand what it says.
     * `SectionDraft` merges the answer onto the `data` sent — text fields
     * only — and this answers that `data` for the console to put in its
     * form. **Nothing is written**: the page is saved by its own form, as
     * ever. 422 on `brief` or `section` with the assistant's own sentence.
     */
    public function aiSection(Request $request, SectionDraft $draft): JsonResponse
    {
        $input = $request->validate([
            'mode' => ['required', 'string', Rule::in(SectionDraft::MODES)],
            'type' => ['required', 'string', Rule::in(array_keys(SectionDraft::SCHEMA))],
            'data' => ['present', 'array'],
            'brief' => ['nullable', 'string', 'max:600', 'required_if:mode,write'],
            'icons' => ['nullable', 'array', 'max:400'],
            'icons.*' => ['string', 'max:40'],
        ], [
            'type.in' => 'The assistant cannot work on this kind of section.',
            'brief.required_if' => 'Say what this section should be about.',
            'brief.max' => 'Keep it to 600 characters.',
        ]);

        $result = $draft->run(
            (string) $input['mode'],
            (string) $input['type'],
            (array) $request->input('data', []),
            isset($input['brief']) ? (string) $input['brief'] : null,
            (array) ($input['icons'] ?? []),
        );

        if (! $result['ok'] || ! isset($result['data'])) {
            $error = $result['error'] ?? 'The AI service answered, but nothing in it was usable. Try again.';

            return response()->json(['message' => $error, 'errors' => [$result['field'] ?? 'section' => [$error]]], 422);
        }

        return response()->json(['data' => ['section_data' => $result['data']]]);
    }

    /**
     * Everything the section builder's selects are drawn from, in one read:
     * the section types and presets, the per-type choices, and the pickers —
     * published content blocks, sliders, galleries and forms, and the two
     * category lists a product `cards` section narrows by. Published only,
     * because a section pointing at a draft is refused on save.
     */
    public function builder(Request $request): JsonResponse
    {
        $published = fn (string $model) => $model::query()->where('status', PublishStatus::Published)
            ->orderBy('name')->get(['id', 'name', 'slug']);

        return response()->json(['data' => [
            'section_types' => PageSectionType::options(),
            'section_presets' => SectionPresets::all(),
            // Custom code (0.158.0): whether this account may choose to run it
            // on the page itself (`CustomCodeGuard`) — the console shows the
            // choice to administrators and a note to everyone else.
            'custom_code' => ['page_mode' => (bool) $request->user()?->isAdmin()],
            // The library (2026-10-05): what "Add a section" offers from it,
            // and the templates a new page may start from.
            'library' => [
                'sections' => SavedSection::query()->where('kind', SavedSection::KIND_SECTION)->orderBy('name')->get()
                    ->map(fn (SavedSection $s) => ['id' => $s->id, 'name' => $s->name, 'type' => $s->blocks[0]['type'] ?? null])->values(),
                'templates' => SavedSection::query()->where('kind', SavedSection::KIND_TEMPLATE)->orderBy('name')->get()
                    ->map(fn (SavedSection $s) => [
                        'id' => $s->id, 'name' => $s->name, 'description' => $s->description, 'count' => count($s->blocks ?? []),
                        'category' => $s->category, 'category_label' => $s->category ? SavedSection::CATEGORIES[$s->category] ?? null : null,
                    ])->values(),
                'categories' => SavedSection::categoryOptions(),
            ],
            'hero_layouts' => [
                ['value' => 'centered', 'label' => 'Centred', 'blurb' => 'The words centred on the section’s ground; no picture needed.'],
                ['value' => 'split', 'label' => 'Split', 'blurb' => 'The words on one side, the picture framed on the other.'],
                ['value' => 'cover', 'label' => 'Cover', 'blurb' => 'The picture fills the band under a dark overlay, the words on top.'],
            ],
            // The assistant on a section (0.127.0): whether it can be asked,
            // on which types, and what it can do.
            'ai_section' => SectionDraft::options(),
            // The Design tab (0.146.0): the section types whose heading colour
            // the website ignores, so the console disables that row for them
            // without listing types of its own.
            'style_options' => ['heading_color_except' => SectionRules::HEADING_COLOR_EXCEPT],
            // Edit on the page (0.128.0): the plain-text fields of each type
            // the live preview lets an editor change in place, and their
            // lengths — read from the save's rules.
            'inline_fields' => SectionRules::inlineFields(),
            // The custom layout section (0.147.0): its widgets with every field,
            // the row and column settings and the limits, so the console lists none.
            'layout' => LayoutRules::options(),
            // Sections on other records (0.129.0): the two layouts a record
            // chooses between, and the section types its body area cannot hold.
            'record_sections' => RecordSections::options(),
            'card_sources' => collect(SectionRules::cardSources())->map(fn ($label, $value) => ['value' => $value, 'label' => $label])->values(),
            'content_blocks' => ContentBlock::query()->where('status', PublishStatus::Published)->orderBy('type')->orderBy('name')
                ->get(['id', 'type', 'name', 'slug'])
                ->map(fn (ContentBlock $b) => ['id' => $b->id, 'name' => $b->name, 'slug' => $b->slug, 'type' => $b->type->value, 'type_label' => $b->type->label()]),
            'sliders' => $published(Slider::class),
            'galleries' => $published(Gallery::class),
            'forms' => $published(Form::class),
            'product_categories' => ProductCategory::query()->orderBy('name')->get(['id', 'name', 'slug']),
            'store_categories' => StoreCategory::query()->orderBy('name')->get(['id', 'name', 'slug']),
            // A downloads section reading the centre may name one shelf (0.131.0).
            'download_categories' => DownloadCategory::query()->active()->ordered()->get(['id', 'name', 'slug']),
        ]]);
    }

    /**
     * The unsaved-draft preview: the sections as typed, validated by the
     * rules a save runs and presented as the public site reads them. Writes
     * nothing — which is the whole of the difference from `update`.
     */
    public function preview(PreviewPageSectionsRequest $request): JsonResponse
    {
        $page = $request->filled('page_id') ? Page::query()->with('faqs')->find($request->integer('page_id')) : null;
        $blocks = json_decode((string) json_encode(SectionRules::normalise($request->validated('blocks'))), true);

        return response()->json(['data' => ['sections' => SectionPresenter::present($blocks, $page)]]);
    }

    /**
     * A page body laid out as builder sections (0.109.0): split at its
     * headings by `BodySections`, cleaned as a saved body is, and written
     * nowhere — the console seeds the builder with it and the page is saved
     * as any other edit.
     */
    public function sectionsFromBody(SectionsFromBodyRequest $request): JsonResponse
    {
        return response()->json(['data' => ['sections' => BodySections::fromHtml((string) $request->validated('body'))]]);
    }

    public function show(Page $page): JsonResource
    {
        return new PageResource($page->load(['faqs', 'answerBlocks', 'seo', 'customValues.field.group']));
    }

    public function store(StorePageRequest $request): JsonResponse
    {
        $page = DB::transaction(function () use ($request) {
            [$attributes, $seo] = $this->splitSeo($request->validated());
            $custom = $this->pullCustomFields($attributes);
            $content = $this->pullAnswerContent($attributes);
            $attributes = self::withSections($attributes);

            $page = Page::create($this->withPublishedAt($attributes));
            $this->saveAnswerContent($page, $content);
            $this->saveSeo($page, $seo);
            $this->saveCustomFields($page, $custom);

            return $page;
        });

        return response()->json(['data' => new PageResource($page->load(['faqs', 'answerBlocks', 'seo', 'customValues.field.group']))], 201);
    }

    public function update(UpdatePageRequest $request, Page $page): JsonResource
    {
        DB::transaction(function () use ($request, $page) {
            [$attributes, $seo] = $this->splitSeo($request->validated());
            $custom = $this->pullCustomFields($attributes);
            $content = $this->pullAnswerContent($attributes);
            $attributes = self::withSections($attributes);

            $page->update($this->withPublishedAt($attributes, $page));
            $this->saveAnswerContent($page, $content);
            $this->saveSeo($page, $seo);
            $this->saveCustomFields($page, $custom);
        });

        return new PageResource($page->fresh(['faqs', 'answerBlocks', 'seo', 'customValues.field.group']));
    }

    /**
     * The sections as stored: `SectionRules::normalise()`, so only declared
     * keys reach the column. Absent leaves them alone; null clears them.
     *
     * @param  array<string, mixed>  $attributes
     * @return array<string, mixed>
     */
    private static function withSections(array $attributes): array
    {
        if (array_key_exists('blocks', $attributes)) {
            $attributes['blocks'] = $attributes['blocks'] === null
                ? null
                : json_decode((string) json_encode(SectionRules::normalise($attributes['blocks'])), true);
        }

        return $attributes;
    }

    public function destroy(Page $page): JsonResponse
    {
        $this->remove($page);

        return response()->json(['message' => 'Page deleted.']);
    }

    /** `POST /admin/pages/bulk` — publish, draft, archive or delete the ticked pages. */
    public function bulk(BulkActionRequest $request): JsonResponse
    {
        return $this->runBulk($request, Page::query(), $this->remove(...));
    }

    /** What deleting a page does, for `destroy()` and the bulk path alike. */
    private function remove(Page $page): void
    {
        DB::transaction(function () use ($page) {
            $page->seo()->delete();
            $page->faqs()->delete();
            $page->answerBlocks()->delete();
            $page->delete();
        });
    }
}
