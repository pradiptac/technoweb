<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ContentTypeResource;
use App\Http\Resources\EntryResource;
use App\Models\ContentType;
use App\Support\EntityLinks;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Custom content on the public site (docs/custom-content.md).
 *
 * `GET /content-types` is the active types, for the sitemap and the menu
 * builder's archive items; `GET /types/{type}` a type and a page of its
 * published entries; `GET /types/{type}/{slug}` one entry, the page.
 *
 * An inactive type is a 404 all the way down — archive and entries — and a
 * draft or a future-dated entry is a 404 like any other draft. A type with
 * its archive switched off still answers the archive read, with
 * `meta.type.archive_enabled: false`, because the sitemap walks it to find
 * the entries; the frontend is what refuses to draw the page.
 */
class ContentTypeController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        return ContentTypeResource::collection(
            ContentType::active()
                ->withMax(['entries' => fn ($q) => $q->published()], 'updated_at')
                ->orderBy('sort_order')
                ->orderBy('name')
                ->get()
        );
    }

    public function archive(Request $request, string $type): AnonymousResourceCollection
    {
        $contentType = ContentType::active()->where('slug', $type)->firstOrFail();
        $perPage = min(max($request->integer('per_page', $contentType->per_page ?: 12), 1), 100);

        // `seo` so the sitemap, which walks this, can honour `sitemap_include`.
        $query = $contentType->entries()->published()->with('seo');

        match ($contentType->sort) {
            'title' => $query->orderBy('title'),
            'manual' => $query->orderBy('sort_order')->orderBy('title'),
            default => $query->orderByDesc('published_at')->orderByDesc('id'),
        };

        $entries = $query->orderBy('id')->paginate($perPage)->withQueryString();
        // The type is the one already in hand, so no row asks for it again.
        $entries->getCollection()->each(fn ($e) => $e->setRelation('contentType', $contentType));

        return EntryResource::collection($entries)->additional(['meta' => [
            'type' => new ContentTypeResource($contentType),
        ]]);
    }

    public function show(string $type, string $slug): JsonResource
    {
        $contentType = ContentType::active()->where('slug', $type)->firstOrFail();
        $entry = $contentType->entries()->published()->where('slug', $slug)->firstOrFail();

        $entry->setRelation('contentType', $contentType);
        $entry->load(['faqs', 'publishedAnswerBlocks', 'seo', 'customValues.field.group']);
        EntityLinks::attach($entry);

        return (new EntryResource($entry))->withSchema();
    }
}
