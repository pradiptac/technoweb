<?php

namespace App\Http\Resources\Admin\Store;

use App\Models\StockMovement;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One line of the stock ledger.
 *
 * Admin only — there is no public counterpart and there must not be. A shop's
 * movement history says what it holds, what it sells and how fast, which is
 * more than the storefront gives away deliberately: `in_stock` is a bit
 * precisely so an exact figure is not published.
 *
 * @mixin StockMovement
 */
class StockMovementResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'at' => $this->created_at?->toIso8601String(),

            /*
             * The snapshot, not the relation. A report of last quarter must
             * read the same next quarter, and `product_id` is null for a
             * product deleted since — which is how the console knows not to
             * link to a screen that is not there.
             */
            'product_id' => $this->store_product_id,
            'product_name' => $this->product_name,
            'variation_name' => $this->variation_name,
            'sku' => $this->sku,

            'delta' => $this->delta,
            // Said rather than left to a sign the eye can skip in a table.
            'direction' => $this->delta > 0 ? 'in' : 'out',
            'quantity' => abs($this->delta),
            // Null wherever it was never known — every movement backfilled
            // from a historic order, whose level afterwards is gone.
            'balance_after' => $this->balance_after,

            'reason' => $this->reason->value,
            'reason_label' => $this->reason->label(),

            'order_number' => $this->order_number,
            'actor_name' => $this->actor_name,
            'note' => $this->note,
        ];
    }
}
