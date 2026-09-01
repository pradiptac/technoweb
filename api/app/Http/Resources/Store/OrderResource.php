<?php

namespace App\Http\Resources\Store;

use App\Support\Store\PaymentOptions;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * An order, as the person who placed it may see it.
 *
 * Two things are deliberately absent and must stay absent. **`access_token`**,
 * which is the key to this page and is returned exactly once, on the response
 * that created the order — echoing it in every read would put it in a browser
 * history and a server log. And **`notes`**, which are written by staff for
 * staff; the ticket module's worst failure is an internal note in a customer's
 * inbox, and this is the same shape.
 *
 * The GST is shown as part of the total, never added to it: prices include it,
 * so this is a breakdown of a figure already paid rather than an extra.
 */
class OrderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'order_number' => $this->order_number,
            'status' => $this->status?->value,
            'payment_method' => $this->payment_method,
            /*
             * How to pay, for the method this order actually used — and null
             * for a gateway order, which has its own button, and null once the
             * money has arrived, because instructions for a payment already
             * made are how somebody pays twice.
             */
            'payment_instructions' => PaymentOptions::forOrder(
                (string) $this->payment_method,
                $this->paid_at !== null,
            ),
            'status_label' => $this->status?->label(),

            'subtotal_paise' => $this->subtotal_paise,
            'discount_paise' => $this->discount_paise,
            'taxable_paise' => $this->taxable_paise,
            'gst_paise' => $this->gst_paise,
            'total_paise' => $this->total_paise,
            'coupon_code' => $this->coupon_code,

            'customer_name' => $this->customer_name,
            'customer_email' => $this->customer_email,
            'customer_phone' => $this->customer_phone,
            'billing_address' => $this->billing_address,
            'shipping_address' => $this->shipping_address,

            'gst_required' => (bool) $this->gst_required,
            'gstin' => $this->gstin,
            'company_name' => $this->company_name,

            /*
             * The invoice is prepared by hand and uploaded. Until it is, the
             * field is simply absent rather than an empty link — a download
             * that 404s is worse than one that is not offered yet.
             */
            'invoice_number' => $this->invoice_number,
            'invoice_date' => $this->invoice_date?->toDateString(),
            'has_invoice' => filled($this->invoice_path),

            'courier' => $this->courier,
            'tracking_number' => $this->tracking_number,
            'tracking_url' => $this->tracking_url,

            'placed_at' => $this->placed_at?->toIso8601String(),
            'paid_at' => $this->paid_at?->toIso8601String(),
            'dispatched_at' => $this->dispatched_at?->toIso8601String(),
            'completed_at' => $this->completed_at?->toIso8601String(),

            'items' => OrderItemResource::collection($this->whenLoaded('items')),

            /*
             * The payment attempts, reduced to what a customer can act on: the
             * status and when. No gateway identifiers, no signature — those are
             * for reconciling against the provider's dashboard and belong to
             * the admin resource.
             */
            'payments' => $this->whenLoaded('payments', fn () => $this->payments->map(fn ($p) => [
                'status' => $p->status?->value,
                'status_label' => $p->status?->label(),
                'method' => $p->method,
                'paid_at' => $p->paid_at?->toIso8601String(),
            ])),
        ];
    }
}
