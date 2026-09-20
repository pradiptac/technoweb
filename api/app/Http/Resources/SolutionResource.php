<?php

namespace App\Http\Resources;

use App\Http\Resources\Concerns\IncludesSchema;
use App\Http\Resources\Concerns\IncludesSeo;
use App\Models\Solution;
use App\Support\MediaMeta;
use App\Support\StructuredData;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Solution */
class SolutionResource extends JsonResource
{
    use IncludesSchema, IncludesSeo;

    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show');

        return [
            'id' => $this->id,
            'title' => $this->title,
            'slug' => $this->slug,
            // The sitemap's `lastmod`: a record's own last change, never the build time. `docs/seo-audit-2026-09-18.md`, F2.
            'updated_at' => $this->updated_at?->toIso8601String(),
            'summary' => $this->summary,
            'icon' => $this->icon,
            'hero_image' => $this->hero_image_path ? asset('storage/'.$this->hero_image_path) : null,
            'hero_image_alt' => MediaMeta::alt($this->hero_image_path),
            'hero_image_focus' => MediaMeta::focus($this->hero_image_path),
            'problem_statement' => $this->when($detail, $this->problem_statement),
            'overview' => $this->when($detail, $this->overview),
            'benefits' => $this->when($detail, $this->benefits),
            'technologies' => $this->when($detail, $this->technologies),
            'status' => $this->status?->value,
            'products' => ProductResource::collection($this->whenLoaded('products')),
            'industries' => IndustryResource::collection($this->whenLoaded('industries')),
            'faqs' => FaqResource::collection($this->whenLoaded('faqs')),
            'seo' => $this->seo(),
            /*
             * The page's JSON-LD, built server-side.
             *
             * Gated on `withSchema()` rather than on the route, because a nested
             * resource inherits its parent's route name — twenty products inside
             * /solutions/{slug} would each build a Product graph and lazy-load a
             * brand and a category. See the IncludesSchema trait.
             *
             * The frontend renders it through `JsonLd`, which escapes `<`. That
             * boundary stays there: JSON.stringify does not escape it, and a CMS
             * field containing `</script>` would close the block.
             */
            'schema' => $this->schema(fn () => StructuredData::service($this->resource)),
        ];
    }
}
