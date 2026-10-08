<?php

namespace App\Http\Resources\Store;

use App\Models\OrderReturn;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A return as its customer sees it (docs/store.md "Returns").
 *
 * What they asked for, where it has got to, and what the desk told them.
 * **No `staff_note` key at all** — the guard is structural, the lesson the
 * ticket module's internal notes taught — and no photograph's address: a
 * count is all the page needs of something the customer themselves sent.
 *
 * @mixin OrderReturn
 */
class OrderReturnResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'reference' => $this->reference,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'reason' => $this->reason->value,
            'reason_label' => $this->reason->label(),
            'details' => $this->details,
            'decision_note' => $this->decision_note,
            'items' => $this->items->map(fn ($line) => [
                'order_item_id' => $line->order_item_id,
                'name' => $line->orderItem?->name,
                'variation_name' => $line->orderItem?->variation_name,
                'quantity' => (int) $line->quantity,
            ])->values(),
            'photos_count' => $this->photos->count(),
            'refund_paise' => $this->refund_paise,
            'requested_at' => $this->created_at?->toIso8601String(),
            'approved_at' => $this->approved_at?->toIso8601String(),
            'rejected_at' => $this->rejected_at?->toIso8601String(),
            'received_at' => $this->received_at?->toIso8601String(),
            'refunded_at' => $this->refunded_at?->toIso8601String(),
            'closed_at' => $this->closed_at?->toIso8601String(),
        ];
    }
}
