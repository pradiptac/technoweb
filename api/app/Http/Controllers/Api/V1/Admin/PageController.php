<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\AnswerBlockKind;
use App\Enums\PageSectionType;
use App\Enums\PublishStatus;
use App\Http\Controllers\Concerns\WritesCmsEntities;
use App\Http\Controllers\Controller;
use App\Http\Requests\PreviewPageSectionsRequest;
use App\Http\Requests\SectionsFromBodyRequest;
use App\Http\Requests\StorePageRequest;
use App\Http\Requests\UpdatePageRequest;
use App\Http\Resources\Admin\PageResource;
use App\Models\ContentBlock;
use App\Models\Form;
use App\Models\Gallery;
use App\Models\Page;
use App\Models\ProductCategory;
use App\Models\SavedSection;
use App\Models\Slider;
use App\Models\StoreCategory;
use App\Support\CustomFields\CustomFields;
use App\Support\PageSections\BodySections;
use App\Support\PageSections\SectionPresenter;
use App\Support\PageSections\SectionPresets;
use App\Support\PageSections\SectionRules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;

/**
 * Standalone page CRUD — privacy, terms, downloads and anything else that is
 * a page rather than a catalogue record. Behind role:content_manager.
 */
class PageController extends Controller
{
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
        ]]);
    }

    /**
     * Everything the section builder's selects are drawn from, in one read:
     * the section types and presets, the per-type choices, and the pickers —
     * published content blocks, sliders, galleries and forms, and the two
     * category lists a product `cards` section narrows by. Published only,
     * because a section pointing at a draft is refused on save.
     */
    public function builder(): JsonResponse
    {
        $published = fn (string $model) => $model::query()->where('status', PublishStatus::Published)
            ->orderBy('name')->get(['id', 'name', 'slug']);

        return response()->json(['data' => [
            'section_types' => PageSectionType::options(),
            'section_presets' => SectionPresets::all(),
            // The library (2026-10-05): what "Add a section" offers from it,
            // and the templates a new page may start from.
            'library' => [
                'sections' => SavedSection::query()->where('kind', SavedSection::KIND_SECTION)->orderBy('name')->get()
                    ->map(fn (SavedSection $s) => ['id' => $s->id, 'name' => $s->name, 'type' => $s->blocks[0]['type'] ?? null])->values(),
                'templates' => SavedSection::query()->where('kind', SavedSection::KIND_TEMPLATE)->orderBy('name')->get()
                    ->map(fn (SavedSection $s) => ['id' => $s->id, 'name' => $s->name, 'description' => $s->description, 'count' => count($s->blocks ?? [])])->values(),
            ],
            'hero_layouts' => [
                ['value' => 'centered', 'label' => 'Centred', 'blurb' => 'The words centred on the section’s ground; no picture needed.'],
                ['value' => 'split', 'label' => 'Split', 'blurb' => 'The words on one side, the picture framed on the other.'],
                ['value' => 'cover', 'label' => 'Cover', 'blurb' => 'The picture fills the band under a dark overlay, the words on top.'],
            ],
            'card_sources' => collect(SectionRules::CARD_SOURCES)->map(fn ($label, $value) => ['value' => $value, 'label' => $label])->values(),
            'content_blocks' => ContentBlock::query()->where('status', PublishStatus::Published)->orderBy('type')->orderBy('name')
                ->get(['id', 'type', 'name', 'slug'])
                ->map(fn (ContentBlock $b) => ['id' => $b->id, 'name' => $b->name, 'slug' => $b->slug, 'type' => $b->type->value, 'type_label' => $b->type->label()]),
            'sliders' => $published(Slider::class),
            'galleries' => $published(Gallery::class),
            'forms' => $published(Form::class),
            'product_categories' => ProductCategory::query()->orderBy('name')->get(['id', 'name', 'slug']),
            'store_categories' => StoreCategory::query()->orderBy('name')->get(['id', 'name', 'slug']),
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
        DB::transaction(function () use ($page) {
            $page->seo()->delete();
            $page->faqs()->delete();
            $page->answerBlocks()->delete();
            $page->delete();
        });

        return response()->json(['message' => 'Page deleted.']);
    }
}
