<?php

namespace App\Http\Resources\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Separate from the public ProductResource, which shapes itself for the
 * catalogue page. This one round-trips exactly what the edit form submits.
 *
 * The index is also the picker other forms use — the solution editor reads
 * `id` and `name` off it — so those two fields are never detail-only.
 */
class ProductResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show', '*.store', '*.update');

        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'sku' => $this->sku,
            'short_description' => $this->short_description,
            'description' => $this->when($detail, $this->description),
            'brand_id' => $this->brand_id,
            'brand_name' => $this->whenLoaded('brand', fn () => $this->brand?->name),
            'product_category_id' => $this->product_category_id,
            'category_name' => $this->whenLoaded('category', fn () => $this->category?->name),

            // Always the right container, never null: the spec editor renders
            // rows from the map and the gallery renders tiles from the list,
            // and neither should have to guard for a missing value.
            'specifications' => (object) ($this->specifications ?? []),
            'features' => $this->features ?? [],
            'images' => $this->images ?? [],
            // Resolved for previewing; `images` stays the storable form.
            'image_urls' => collect($this->images ?? [])
                ->map(fn ($path) => asset('storage/'.$path))
                ->all(),

            'datasheet_path' => $this->datasheet_path,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'is_featured' => (bool) $this->is_featured,
            'availability' => $this->availability?->value,
            'sort_order' => (int) $this->sort_order,

            'solution_ids' => $this->whenLoaded('solutions', fn () => $this->solutions->pluck('id')),
            'related_product_ids' => $this->whenLoaded('relatedProducts', fn () => $this->relatedProducts->pluck('id')),
            'faqs' => $this->whenLoaded('faqs', fn () => $this->faqs->map(fn ($f) => [
                'question' => $f->question,
                'answer' => $f->answer,
            ])),

            'seo' => $this->when($detail, fn () => SeoOverrideArray::from($this->seo)),
            'seo_defaults' => $this->when($detail, fn () => $this->resolvedSeo()),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
