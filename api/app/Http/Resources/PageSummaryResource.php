<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A CMS page without its body.
 *
 * Exists for `GET /pages`, which the sitemap uses to discover pages an editor
 * created — /privacy, /terms, /downloads and anything added later. The
 * sitemap needs a slug, a modified date and whether the page opted out; it
 * has no use for the HTML, and shipping every page's full body to build a
 * list of URLs gets worse with every page added.
 *
 * A separate resource rather than making `body` conditional inside
 * PageResource: that would have to key on the route name, which is the exact
 * trap PageResource's own comment warns about for `seo`.
 */
class PageSummaryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'slug' => $this->slug,
            'updated_at' => $this->updated_at?->toIso8601String(),
            'seo' => $this->when(
                $this->resource->relationLoaded('seo'),
                fn () => new SeoResource($this->resolvedSeo())
            ),
        ];
    }
}
