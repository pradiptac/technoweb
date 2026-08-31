<?php

namespace App\Http\Resources\Admin\Store;

use App\Models\DigitalCode;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One line, as whoever packs or fulfils it needs to see it.
 *
 * The snapshot, plus what has happened to the licence keys for it. **The codes
 * themselves are not here.** Staff need to know how many were issued and
 * whether any are outstanding; the key itself belongs to the buyer, and an
 * order listing that printed one would be a licence on a screen in a room
 * anybody can walk into. The console has a deliberate reveal for the one case
 * where somebody has to read it out — see the admin codes endpoint.
 */
class OrderItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $issued = $this->type?->needsCode()
            ? DigitalCode::where('order_item_id', $this->id)->count()
            : 0;

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
            'store_product_id' => $this->store_product_id,

            'needs_codes' => (bool) $this->type?->needsCode(),
            'codes_issued' => $issued,
            'codes_outstanding' => $this->type?->needsCode() ? max(0, $this->quantity - $issued) : 0,
        ];
    }
}
