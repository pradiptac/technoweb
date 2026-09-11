<?php

namespace App\Http\Resources\Admin\Store;

use App\Http\Resources\Admin\SeoOverrideArray;
use App\Support\Store\ActivationProcedure;
use App\Support\Store\ProductFeed;
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

            /*
             * What a shopping feed identifies this by, which the SKU is not —
             * a SKU is our own filing code and an MPN is the manufacturer's.
             * `identifier_exists` is absent deliberately: it is derived from
             * these two being blank, so a field for it would be a second answer
             * free to contradict them.
             */
            'gtin' => $this->gtin,
            'mpn' => $this->mpn,
            'condition' => $this->condition?->value,
            'google_product_category' => $this->google_product_category,
            'weight_grams' => $this->weight_grams,
            'feed_include' => (bool) $this->feed_include,
            /*
             * Why the shopping feed leaves this out, or null. Only the data
             * problems — a missing or SVG-only picture — are worth a badge; a
             * product somebody withheld, or a service, is a decision. Google
             * rejects SVG outright and this library is largely SVG placeholder
             * art, so without this the disapproval surfaces nowhere on our
             * side.
             */
            'feed_problem' => $this->status?->value === 'published'
                ? (in_array($p = ProductFeed::skipReason($this->resource), ['no_image', 'unsupported_image_format'], true) ? $p : null)
                : null,
            'type' => $this->type?->value,
            'type_label' => $this->type?->label(),

            'short_description' => $this->short_description,
            'description' => $this->when($detail, $this->description),

            /*
             * Detail only, like the description: these are two long fields
             * nothing on a list screen renders, and a products index carrying
             * every product's activation steps is bytes over the wire for
             * markup nobody draws.
             *
             * `activation_pdf_name` is resolved rather than stored, because the
             * path on the row is a hash and the field has to show what the
             * customer will actually receive.
             */
            'activation_procedure' => $this->when($detail, $this->activation_procedure),
            'activation_pdf_path' => $this->when($detail, $this->activation_pdf_path),
            'activation_pdf_name' => $this->when(
                $detail,
                fn () => $this->activation_pdf_path
                    ? ActivationProcedure::humanName($this->activation_pdf_path)
                    : null,
            ),

            'store_category_id' => $this->store_category_id,
            'category_name' => $this->whenLoaded('category', fn () => $this->category?->name),
            'brand_id' => $this->brand_id,
            'brand_name' => $this->whenLoaded('brand', fn () => $this->brand?->name),

            'price_paise' => $this->price_paise,
            'compare_at_paise' => $this->compare_at_paise,
            'track_stock' => (bool) $this->track_stock,
            /*
             * The raw column, because the form edits it — and for a product
             * with variations it is a leftover nothing reads. Anything
             * *displaying* how many there are wants `stock_on_hand`.
             */
            'stock' => (int) $this->stock,
            'stock_on_hand' => $this->stockOnHand(),
            'allow_oversell' => (bool) $this->allow_oversell,
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
                'gtin' => $v->gtin,
                'mpn' => $v->mpn,
                'options' => (object) ($v->options ?? []),
                'price_paise' => $v->price_paise,
                'stock' => (int) $v->stock,
                'allow_oversell' => (bool) $v->allow_oversell,
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
