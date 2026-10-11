<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\SavedSectionRequest;
use App\Http\Resources\Admin\SavedSectionResource;
use App\Models\SavedSection;
use App\Support\PageSections\SectionRules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Http\Response;

/**
 * The section library and page templates (2026-10-05, docs/page-builder.md
 * "The library"), `role:content_manager` like the pages they serve.
 *
 * Sections are stored in the builder's own shape and normalised by the same
 * `SectionRules::normalise()` a page's are, so a library section placed on a
 * page — linked or copied — is exactly what the page would have stored.
 */
class SavedSectionController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $items = SavedSection::query()
            ->with('author:id,name')
            ->when($request->filled('kind'), fn ($q) => $q->where('kind', $request->string('kind')))
            ->when($request->filled('category'), fn ($q) => $q->where('category', $request->string('category')))
            ->when($request->filled('q'), fn ($q) => $q->where('name', 'like', '%'.addcslashes($request->string('q')->value(), '%_\\').'%'))
            ->orderBy('kind')->orderBy('name')
            ->paginate(min($request->integer('per_page', 50), 100))
            ->withQueryString();

        return SavedSectionResource::collection($items)->additional(['meta' => [
            'categories' => SavedSection::categoryOptions(),
            'kinds' => [
                ['value' => SavedSection::KIND_SECTION, 'label' => 'Section', 'blurb' => 'One section, placed on pages linked (edit once, every page changes) or as a copy.'],
                ['value' => SavedSection::KIND_TEMPLATE, 'label' => 'Page template', 'blurb' => 'A whole stack of sections a new page can start from.'],
            ],
        ]]);
    }

    public function show(SavedSection $savedSection): JsonResource
    {
        return new SavedSectionResource($savedSection->load('author:id,name'));
    }

    public function store(SavedSectionRequest $request): JsonResponse
    {
        $item = SavedSection::create([
            'kind' => $request->validated('kind'),
            'name' => $request->validated('name'),
            'description' => $request->validated('description'),
            // A section has no category; only a template files under one.
            'category' => $request->validated('kind') === SavedSection::KIND_TEMPLATE ? $request->validated('category') : null,
            'blocks' => self::normalised($request->validated('blocks')),
            'created_by' => $request->user()?->getKey(),
        ]);

        return (new SavedSectionResource($item->load('author:id,name')))->response()->setStatusCode(201);
    }

    public function update(SavedSectionRequest $request, SavedSection $savedSection): JsonResource
    {
        $attributes = collect($request->validated())->only(['name', 'description'])->all();
        if ($request->has('category') && $savedSection->kind === SavedSection::KIND_TEMPLATE) {
            $attributes['category'] = $request->validated('category');
        }
        if ($request->has('blocks')) {
            $attributes['blocks'] = self::normalised($request->validated('blocks'));
        }
        $savedSection->update($attributes);

        return new SavedSectionResource($savedSection->load('author:id,name'));
    }

    /**
     * Refused while any page, template or record places it linked: deleting it
     * would take the section off those pages with nothing said. Detach it there
     * first (the builder's "Make a copy here"), then delete.
     */
    public function destroy(SavedSection $savedSection): Response|JsonResponse
    {
        $uses = $savedSection->kind === SavedSection::KIND_SECTION ? $savedSection->linkedFrom() : [];
        if ($uses !== []) {
            return response()->json([
                'message' => 'This section is still placed, linked, on '.self::where($uses).'. Make a copy of it there first.',
                'linked_from' => $uses,
            ], 422);
        }
        $savedSection->delete();

        return response()->noContent();
    }

    /**
     * "2 pages, 1 template and 1 solution", counted from `linkedFrom()`.
     *
     * @param  list<array{kind: string}>  $uses
     */
    private static function where(array $uses): string
    {
        $counts = array_count_values(array_column($uses, 'kind'));
        $parts = [];
        $words = [
            'page' => ['page', 'pages'], 'template' => ['template', 'templates'],
            'solution' => ['solution', 'solutions'], 'service' => ['service', 'services'],
            'industry' => ['industry', 'industries'], 'case_study' => ['case study', 'case studies'],
            'blog_post' => ['blog post', 'blog posts'], 'knowledge_article' => ['knowledge article', 'knowledge articles'],
            'product' => ['product', 'products'], 'store_product' => ['shop product', 'shop products'],
            'event' => ['event', 'events'], 'job_opening' => ['vacancy', 'vacancies'],
            'entry' => ['content entry', 'content entries'],
        ];
        foreach ($words as $kind => [$one, $many]) {
            if ($n = $counts[$kind] ?? 0) {
                $parts[] = $n.' '.($n === 1 ? $one : $many);
            }
        }

        $last = array_pop($parts);

        return $parts === [] ? (string) $last : implode(', ', $parts).' and '.$last;
    }

    /**
     * The builder's stored shape, through JSON so the objects `normalise()`
     * returns for `data` are arrays in the column.
     *
     * @return list<array<string, mixed>>
     */
    private static function normalised(mixed $blocks): array
    {
        return json_decode((string) json_encode(SectionRules::normalise($blocks)), true);
    }
}
