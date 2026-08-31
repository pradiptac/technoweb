<?php

namespace App\Http\Resources\Admin\Store;

use App\Http\Resources\Admin\SeoOverrideArray;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Separate from the storefront's resource, which shapes itself for a shop page.
 * This one round-trips exactly what the edit form submits.
 *
 * **Paise in, paise out.** The console divides by 100 to draw a rupee input and
 * converts back by parsing the text; doing it here would put a decimal on the
 * wire, and a decimal is where a price becomes 1179.9999.
 *
 * `stock` is a real number on this side. It is a *public* endpoint that must
 * not publish it, not the console — whoever runs the shop needs the figure.
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
            'type' => $this->type?->value,
            'type_label' => $this->type?->label(),

            'short_description' => $this->short_description,
            'description' => $this->when($detail, $this->description),

            'store_category_id' => $this->store_category_id,
            'category_name' => $this->whenLoaded('category', fn () => $this->category?->name),
            'brand_id' => $this->brand_id,
            'brand_name' => $this->whenLoaded('brand', fn () => $this->brand?->name),

            'price_paise' => $this->price_paise,
            'compare_at_paise' => $this->compare_at_paise,
            'track_stock' => (bool) $this->track_stock,
            'stock' => (int) $this->stock,
            'in_stock' => $this->inStock(),
            'returnable' => (bool) $this->returnable,

            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'is_featured' => (bool) $this->is_featured,
            'sort_order' => (int) $this->sort_order,

            // Always the right container, never null: the spec editor renders
            // rows from the map and the gallery renders tiles from the list,
            // and neither should have to guard for a missing value.
            'specifications' => (object) ($this->specifications ?? []),
            'features' => $this->features ?? [],
            'images' => $this->images ?? [],
            // Resolved for previewing; `images` stays the storable form.
            'image_urls' => collect($this->images ?? [])->map(fn ($p) => asset('storage/'.$p))->all(),

            'variations' => $this->whenLoaded('variations', fn () => $this->variations->map(fn ($v) => [
                'id' => $v->id,
                'name' => $v->name,
                'sku' => $v->sku,
                'options' => (object) ($v->options ?? []),
                'price_paise' => $v->price_paise,
                'stock' => (int) $v->stock,
                'weight_grams' => $v->weight_grams,
                'image_path' => $v->image_path,
                'is_active' => (bool) $v->is_active,
            ])),

            'seo' => $this->when($detail, fn () => SeoOverrideArray::from($this->seo)),
            'seo_defaults' => $this->when($detail, fn () => $this->resolvedSeo()),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
