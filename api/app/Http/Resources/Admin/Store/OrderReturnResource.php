<?php

namespace App\Http\Resources\Admin\Store;

use App\Enums\ReturnStatus;
use App\Models\OrderReturn;
use App\Support\Store\Returns\ReturnActions;
use App\Support\Store\Returns\ReturnMail;
use App\Support\Store\Returns\ReturnPickups;
use App\Support\Store\Shipping\CourierSettings;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A return as the desk works it (docs/store.md "Returns").
 *
 * `allowed_next` is what the screen may offer now â€” a button is a promise,
 * the rule `schema_type` and the lead's status select settled. A
 * photograph is named and sized and never addressed: its `path` is a place
 * on the private disk, and the console fetches the bytes through
 * `GET /admin/store/returns/{reference}/photos/{id}`.
 *
 * The body of the `return.requested` webhook too, less `staff_note`.
 *
 * @mixin OrderReturn
 */
class OrderReturnResource extends JsonResource
{
    private bool $detail = false;

    public function detail(): static
    {
        $this->detail = true;

        return $this;
    }

    /**
     * The courier collecting it (0.159.0, docs/store.md "Return pickups").
     * Every `can_*` is the answer the API will give to the press. Null while
     * Shiprocket is off and nothing was ever booked.
     *
     * @return array<string, mixed>|null
     */
    private function pickup(): ?array
    {
        $return = $this->resource;
        $active = CourierSettings::active();

        if (! $active && $return->pickup_booking === null) {
            return null;
        }

        return [
            'active' => $active,
            'booking' => $return->pickup_booking,
            'attempts' => (int) $return->pickup_attempts,
            'shiprocket_order_id' => $return->pickup_sr_order_id,
            'shipment_id' => $return->pickup_shipment_id,
            'awb' => $return->pickup_awb,
            'courier' => $return->pickup_courier,
            'requested_at' => $return->pickup_requested_at?->toIso8601String(),
            'status_id' => $return->pickup_status_id,
            'status' => $return->pickup_status,
            'status_at' => $return->pickup_status_at?->toIso8601String(),
            'error' => $return->pickup_error,
            'can_book' => ReturnPickups::canBook($return),
            // True when the order is made and only the courier or the pickup request is outstanding.
            'resume' => ReturnPickups::incomplete($return),
            'can_rates' => $active && ReturnPickups::refusalToBook($return) === null && ! ReturnPickups::incomplete($return) && $return->pickup_booking !== 'created',
            'can_cancel' => ReturnPickups::canCancel($return),
            // Why not, in words — only worth saying for an approved return that cannot be booked.
            'book_refusal' => $active && $return->status === ReturnStatus::Approved && ! ReturnPickups::canBook($return) && $return->pickup_booking !== 'created'
                ? ReturnPickups::refusalToBook($return)
                : null,
        ];
    }

    public function toArray(Request $request): array
    {
        $order = $this->order;

        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'is_open' => $this->status->isOpen(),
            'reason' => $this->reason->value,
            'reason_label' => $this->reason->label(),
            'order_number' => $order?->order_number,
            'customer_name' => $order?->customer_name,
            'customer_email' => $order?->customer_email,
            'customer_phone' => $order?->customer_phone,
            'order_paid' => $order?->paid_at !== null,
            'items_count' => (int) $this->items->sum('quantity'),
            'photos_count' => $this->photos->count(),
            'refund_paise' => $this->refund_paise,
            'requested_at' => $this->created_at?->toIso8601String(),
            'approved_at' => $this->approved_at?->toIso8601String(),
            'rejected_at' => $this->rejected_at?->toIso8601String(),
            'received_at' => $this->received_at?->toIso8601String(),
            'refunded_at' => $this->refunded_at?->toIso8601String(),
            'closed_at' => $this->closed_at?->toIso8601String(),
            'admin_path' => $this->adminPath(),

            $this->mergeWhen($this->detail, fn () => [
                'details' => $this->details,
                'decision_note' => $this->decision_note,
                'staff_note' => $this->staff_note,
                'decided_by' => $this->decider?->name,
                'allowed_next' => array_map(
                    fn (ReturnStatus $s) => ['value' => $s->value, 'label' => $s->label()],
                    $this->status->next(),
                ),
                'items' => $this->items->map(fn ($line) => [
                    'id' => $line->id,
                    'order_item_id' => $line->order_item_id,
                    'name' => $line->orderItem?->name,
                    'variation_name' => $line->orderItem?->variation_name,
                    'sku' => $line->orderItem?->sku,
                    'unit_price_paise' => (int) ($line->orderItem->unit_price_paise ?? 0),
                    'ordered_quantity' => (int) ($line->orderItem->quantity ?? 0),
                    'quantity' => (int) $line->quantity,
                    'received_quantity' => $line->received_quantity,
                    'restocked_quantity' => (int) $line->restocked_quantity,
                ])->values(),
                'photos' => $this->photos->map(fn ($photo) => [
                    'id' => $photo->id,
                    'name' => $photo->name,
                    'size' => (int) $photo->size,
                ])->values(),
                'suggested_refund_paise' => ReturnActions::suggestedRefundPaise($this->resource),
                'refund_reference' => $this->refundPayment?->reference,
                'return_instructions' => ReturnMail::instructions(),
                'pickup' => $this->pickup(),
                'order' => $order === null ? null : [
                    'order_number' => $order->order_number,
                    'status' => $order->status->value,
                    'status_label' => $order->status->label(),
                    'total_paise' => (int) $order->total_paise,
                    'payment_method' => $order->payment_method,
                    'dispatched_at' => $order->dispatched_at?->toIso8601String(),
                    'completed_at' => $order->completed_at?->toIso8601String(),
                ],
            ]),
        ];
    }
}
