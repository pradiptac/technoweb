<?php

namespace App\Http\Resources\Store;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One line of what was bought, read entirely from the snapshot.
 *
 * Nothing here joins to the product. The name, the part number, the options and
 * the price are on the row, so a product renamed, repriced or deleted since
 * cannot change what this order says was sold — which is the whole reason the
 * snapshot exists.
 *
 * `slug` is the one exception and it is a link rather than a fact: it points at
 * the product page if it still exists, and is null when it does not.
 */
class OrderItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'variation_name' => $this->variation_name,
            'sku' => $this->sku,
            'options' => $this->options,
            'type' => $this->type?->value,
            'quantity' => $this->quantity,
            'unit_price_paise' => $this->unit_price_paise,
            'line_total_paise' => $this->line_total_paise,
            'returnable' => (bool) $this->returnable,
            'slug' => $this->whenLoaded('product', fn () => $this->product?->slug),
        ];
    }
}
