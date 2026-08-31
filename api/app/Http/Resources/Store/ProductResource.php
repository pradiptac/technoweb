<?php

namespace App\Http\Resources\Store;

use App\Http\Resources\BrandResource;
use App\Http\Resources\SeoResource;
use App\Support\MediaAlt;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * What the storefront sees.
 *
 * **No stock count.** `in_stock` is the bit a shop needs, and an exact figure
 * on a public endpoint publishes what this business holds to anybody who curls
 * it — while being stale between the page and the checkout anyway. "Only 2
 * left" is a real pattern and this is deliberately not it.
 *
 * **No `compare_at_paise` unless it is genuinely higher.** A struck-through
 * price equal to or below the real one is either a mistake or a lie, and both
 * render as a discount that is not there.
 */
class ProductResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show');

        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'sku' => $this->sku,
            'type' => $this->type?->value,
            'short_description' => $this->short_description,

            // Full body only on the detail endpoint — keeps list payloads small.
            'description' => $this->when($detail, $this->description),
            'specifications' => $this->when($detail, $this->specifications),
            'features' => $this->when($detail, $this->features),

            'images' => collect($this->images ?? [])->map(fn ($p) => asset('storage/'.$p))->all(),
            // Parallel to `images`, index for index: a gallery needs the
            // description that belongs to the picture it is showing.
            'image_alts' => MediaAlt::forEach($this->images),

            'price_paise' => $this->price_paise,
            'compare_at_paise' => $this->when(
                $this->compare_at_paise > $this->price_paise,
                $this->compare_at_paise,
            ),
            'in_stock' => $this->inStock(),

            /*
             * Non-returnable is said before somebody pays, on the page, in the
             * cart and at the checkout. It is a term of the sale, and a term
             * disclosed only on the receipt is not a term anybody agreed to.
             */
            'returnable' => (bool) $this->returnable,

            'is_featured' => (bool) $this->is_featured,
            'category' => new CategoryResource($this->whenLoaded('category')),
            'brand' => new BrandResource($this->whenLoaded('brand')),

            /*
             * The parent is attached to each child on the way out.
             *
             * A variation's price and stock are answered partly by its product
             * — a null price means the product's — and `preventLazyLoading` is
             * on, so a child reaching back up would throw. It is also twenty
             * queries for one row they all share. The product is right here.
             */
            'variations' => VariationResource::collection(
                $this->whenLoaded('variations', fn () => $this->variations->each(
                    fn ($variation) => $variation->setRelation('product', $this->resource),
                )),
            ),

            // relationLoaded, not whenLoaded: the latter short-circuits to null
            // when the relation is loaded but empty, and most records have no
            // override row — the derived defaults are still wanted for those.
            'seo' => $this->when(
                $this->resource->relationLoaded('seo'),
                fn () => new SeoResource($this->resolvedSeo()),
            ),
        ];
    }
}
