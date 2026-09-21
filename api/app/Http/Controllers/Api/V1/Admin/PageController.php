<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\AnswerBlockKind;
use App\Http\Controllers\Concerns\WritesCmsEntities;
use App\Http\Controllers\Controller;
use App\Http\Requests\StorePageRequest;
use App\Http\Requests\UpdatePageRequest;
use App\Http\Resources\Admin\PageResource;
use App\Models\Page;
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
        ]]);
    }

    public function show(Page $page): JsonResource
    {
        return new PageResource($page->load(['faqs', 'answerBlocks', 'seo']));
    }

    public function store(StorePageRequest $request): JsonResponse
    {
        $page = DB::transaction(function () use ($request) {
            [$attributes, $seo] = $this->splitSeo($request->validated());
            $content = $this->pullAnswerContent($attributes);

            $page = Page::create($this->withPublishedAt($attributes));
            $this->saveAnswerContent($page, $content);
            $this->saveSeo($page, $seo);

            return $page;
        });

        return response()->json(['data' => new PageResource($page->load(['faqs', 'answerBlocks', 'seo']))], 201);
    }

    public function update(UpdatePageRequest $request, Page $page): JsonResource
    {
        DB::transaction(function () use ($request, $page) {
            [$attributes, $seo] = $this->splitSeo($request->validated());
            $content = $this->pullAnswerContent($attributes);

            $page->update($this->withPublishedAt($attributes, $page));
            $this->saveAnswerContent($page, $content);
            $this->saveSeo($page, $seo);
        });

        return new PageResource($page->fresh(['faqs', 'answerBlocks', 'seo']));
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
