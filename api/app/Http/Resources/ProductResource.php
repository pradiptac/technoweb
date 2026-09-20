<?php

namespace App\Http\Resources;

use App\Http\Resources\Concerns\IncludesSchema;
use App\Http\Resources\Concerns\IncludesSeo;
use App\Models\Product;
use App\Support\MediaMeta;
use App\Support\StructuredData;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Product */
class ProductResource extends JsonResource
{
    use IncludesSchema, IncludesSeo;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            // The sitemap's `lastmod`: a record's own last change, never the build time. `docs/seo-audit-2026-09-18.md`, F2.
            'updated_at' => $this->updated_at?->toIso8601String(),
            'sku' => $this->sku,
            'is_featured' => (bool) $this->is_featured,
            'short_description' => $this->short_description,
            // Full body only on the detail endpoint — keeps list payloads small.
            'description' => $this->when($request->routeIs('*.show'), $this->description),
            'specifications' => $this->when($request->routeIs('*.show'), $this->specifications),
            'features' => $this->when($request->routeIs('*.show'), $this->features),
            'images' => collect($this->images ?? [])->map(fn ($p) => asset('storage/'.$p))->all(),
            // Parallel to `images`, index for index — a gallery needs the
            // description that belongs to the picture it is showing.
            'image_alts' => MediaMeta::alts($this->images),
            // Parallel to `image_alts`, same order and length: the focal point of each, or null.
            'image_focuses' => MediaMeta::focuses($this->images),
            'datasheet_url' => $this->datasheet_path ? asset('storage/'.$this->datasheet_path) : null,
            'status' => $this->status?->value,
            'brand' => new BrandResource($this->whenLoaded('brand')),
            'category' => new ProductCategoryResource($this->whenLoaded('category')),
            'related_products' => self::collection($this->whenLoaded('relatedProducts')),
            'related_solutions' => SolutionResource::collection($this->whenLoaded('solutions')),
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
            'schema' => $this->schema(fn () => StructuredData::product($this->resource)),
        ];
    }
}
