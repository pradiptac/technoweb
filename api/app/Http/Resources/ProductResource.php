<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'sku' => $this->sku,
            'short_description' => $this->short_description,
            // Full body only on the detail endpoint — keeps list payloads small.
            'description' => $this->when($request->routeIs('*.show'), $this->description),
            'specifications' => $this->when($request->routeIs('*.show'), $this->specifications),
            'features' => $this->when($request->routeIs('*.show'), $this->features),
            'images' => collect($this->images ?? [])->map(fn ($p) => asset('storage/'.$p))->all(),
            'datasheet_url' => $this->datasheet_path ? asset('storage/'.$this->datasheet_path) : null,
            'status' => $this->status?->value,
            'brand' => new BrandResource($this->whenLoaded('brand')),
            'category' => new ProductCategoryResource($this->whenLoaded('category')),
            'related_products' => self::collection($this->whenLoaded('relatedProducts')),
            'related_solutions' => SolutionResource::collection($this->whenLoaded('solutions')),
            'faqs' => FaqResource::collection($this->whenLoaded('faqs')),
            // Present only when eager-loaded. Deliberately not keyed on the
            // route: a nested resource inherits the parent's route name, so
            // an industry rendered inside /solutions/{slug} used to think it
            // was a detail view and lazy-load its own SEO row.
            // relationLoaded, not whenLoaded: whenLoaded short-circuits to null
            // when the relation is loaded but empty, and most records have no
            // override row — we still want the derived defaults for those.
            'seo' => $this->when(
                $this->resource->relationLoaded('seo'),
                fn () => new SeoResource($this->resolvedSeo())
            ),
        ];
    }
}
