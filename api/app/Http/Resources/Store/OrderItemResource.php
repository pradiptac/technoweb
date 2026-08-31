<?php

namespace App\Http\Resources\Store;

use App\Models\DigitalCode;
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

            /*
             * Whether there is a code to ask for — never the code itself.
             *
             * Revealing one is an action that is recorded, so it cannot be a
             * field on an ordinary read: a page anybody with the link may leave
             * open on a shared screen must not print a licence key. See
             * `OrderCodeController`.
             */
            'has_codes' => $this->type?->needsCode()
                ? DigitalCode::where('order_item_id', $this->id)->exists()
                : false,
            'slug' => $this->whenLoaded('product', fn () => $this->product?->slug),
        ];
    }
}
