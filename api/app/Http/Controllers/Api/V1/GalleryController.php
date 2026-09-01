<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\GalleryResource;
use App\Models\Gallery;
use Illuminate\Http\Resources\Json\JsonResource;

class GalleryController extends Controller
{
    /**
     * One gallery by slug, for a [gallery] shortcode.
     *
     * A gallery with no items answers 404 rather than an empty success, the
     * rule `/sliders/{slug}` follows: the frontend's fallback is "render
     * nothing", and an empty 200 would put a tab strip with no pictures under
     * it into the middle of somebody's article.
     *
     * Groups are returned whole even when a tab is empty. That is deliberate
     * and is not the same case — an empty *gallery* is nothing to show, an
     * empty *tab* is a tab somebody made and has not filled yet, and hiding it
     * would make the console and the page disagree about what exists.
     */
    public function show(string $slug): JsonResource
    {
        $gallery = Gallery::query()
            ->published()
            ->where('slug', $slug)
            ->with(['groups', 'items.group'])
            ->first();

        abort_if(! $gallery || $gallery->items->isEmpty(), 404);

        return new GalleryResource($gallery);
    }
}
