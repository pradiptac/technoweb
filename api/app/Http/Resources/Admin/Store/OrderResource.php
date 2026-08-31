<?php

namespace App\Http\Resources\Admin\Store;

use App\Support\Store\DigitalFulfilment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * An order as the people who fulfil it see it.
 *
 * Everything the customer's own resource carries, plus the three things it
 * deliberately withholds: the payment attempts in full, the status trail, and
 * the internal notes. That last one is the same split the ticket module keeps,
 * and there it is load-bearing — the worst failure that module can have is an
 * internal note in a customer's inbox. Here the guard is simply that the
 * customer resource has no `notes` key at all.
 *
 * **The access token is not here either.** Staff reach an order through the
 * console, not through the customer's link, and putting a live magic link in an
 * admin listing is a link that gets pasted into a chat window.
 */
class OrderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show', '*.update', '*.status', '*.shipping', '*.fulfil');

        return [
            'id' => $this->id,
            'order_number' => $this->order_number,
            'status' => $this->status?->value,
            'status_label' => $this->status?->label(),
            // What a person is allowed to move it to, decided by the enum
            // rather than by the console — one list, and the API refuses
            // anything else regardless.
            'allowed_transitions' => $this->when($detail, fn () => array_map(
                fn ($s) => ['value' => $s->value, 'label' => $s->label()],
                $this->status?->allowedTransitions() ?? [],
            )),

            'customer_name' => $this->customer_name,
            'customer_email' => $this->customer_email,
            'customer_phone' => $this->customer_phone,
            'customer_id' => $this->customer_id,

            'subtotal_paise' => $this->subtotal_paise,
            'discount_paise' => $this->discount_paise,
            'taxable_paise' => $this->taxable_paise,
            'gst_paise' => $this->gst_paise,
            'total_paise' => $this->total_paise,
            'coupon_code' => $this->coupon_code,

            'billing_address' => $this->when($detail, $this->billing_address),
            'shipping_address' => $this->when($detail, $this->shipping_address),
            'needs_shipping' => $this->shipping_address !== null,

            'gst_required' => (bool) $this->gst_required,
            'gstin' => $this->gstin,
            'company_name' => $this->company_name,

            'invoice_number' => $this->invoice_number,
            'invoice_date' => $this->invoice_date?->toDateString(),
            'has_invoice' => filled($this->invoice_path),

            'courier' => $this->courier,
            'tracking_number' => $this->tracking_number,
            'tracking_url' => $this->tracking_url,
            'shipping_notes' => $this->when($detail, $this->shipping_notes),

            /*
             * Whether somebody is waiting on a licence key.
             *
             * On the *list* as well as the detail, because it is the reason a
             * store manager opens this screen at all — a paid order with an
             * unissued code is the one thing here that a customer is actively
             * waiting for.
             */
            'awaiting_codes' => $this->whenLoaded('items', fn () => DigitalFulfilment::isOutstanding($this->resource)),

            'placed_at' => $this->placed_at?->toIso8601String(),
            'paid_at' => $this->paid_at?->toIso8601String(),
            'dispatched_at' => $this->dispatched_at?->toIso8601String(),
            'completed_at' => $this->completed_at?->toIso8601String(),

            'items' => OrderItemResource::collection($this->whenLoaded('items')),

            'payments' => $this->whenLoaded('payments', fn () => $this->payments->map(fn ($p) => [
                'id' => $p->id,
                'gateway' => $p->gateway,
                'status' => $p->status?->value,
                'status_label' => $p->status?->label(),
                'amount_paise' => $p->amount_paise,
                'method' => $p->method,
                // The identifiers exist so a figure here can be reconciled
                // against the provider's own dashboard. That is the whole
                // reason staff see them and the customer does not.
                'gateway_payment_id' => $p->gateway_payment_id,
                'gateway_order_id' => $p->gateway_order_id,
                'failure_reason' => $p->failure_reason,
                'paid_at' => $p->paid_at?->toIso8601String(),
                'created_at' => $p->created_at?->toIso8601String(),
            ])),

            'history' => $this->whenLoaded('history', fn () => $this->history->map(fn ($h) => [
                'from_status' => $h->from_status,
                'to_status' => $h->to_status,
                'note' => $h->note,
                'actor_name' => $h->actor_name,
                'at' => $h->created_at?->toIso8601String(),
            ])),

            'notes' => $this->whenLoaded('notes', fn () => $this->notes->map(fn ($n) => [
                'id' => $n->id,
                'body' => $n->body,
                'actor_name' => $n->actor_name,
                'at' => $n->created_at?->toIso8601String(),
            ])),
        ];
    }
}
