<?php

namespace App\Support\WordPress\Steps;

use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\PaymentStatus;
use App\Enums\ProductType;
use App\Models\Coupon;
use App\Models\CouponUsage;
use App\Models\Order;
use App\Models\OrderNote;
use App\Models\OrderStatusEvent;
use App\Models\Payment;
use App\Support\WordPress\Context;
use App\Support\WordPress\Outcome;
use App\Support\WordPress\Prices;
use App\Support\WordPress\WooAddress;
use Carbon\CarbonImmutable;
use Illuminate\Support\Str;

/**
 * WooCommerce orders, as history.
 *
 * **Written in their final state, never through the checkout.** `Checkout`,
 * `Settlement` and `Order::moveTo()` each send mail, messages and webhooks,
 * take stock and mint accounts — every one of which already happened, or
 * did not, on the old site. So an imported order is inserted as it stands:
 * its totals are WooCommerce's, its lines are snapshots, its stock is left
 * alone (the products arrived with today's counts), and on a second run it
 * is updated with `saveQuietly()` so a status that changed on the old site
 * fires no `order.status_changed` webhook here.
 *
 * **Its number is `WC-{number}`**, outside the `ORD-{year}-` sequence
 * `Order::nextNumber()` reads, so the next live order's number is untouched.
 * **`review_requested_at` is stamped**, or the hourly review request would
 * mail every past customer about everything they ever bought.
 *
 * **The lines add up to the total.** WooCommerce keeps line amounts before
 * tax with the tax beside them, and shipping and fees as lines of their own;
 * here a line's price includes GST and there is no shipping column. So each
 * product line is its subtotal plus its tax, shipping and each fee become a
 * service line, the discount is WooCommerce's discount plus its tax, and GST
 * is WooCommerce's recorded tax. An order whose parts still differ from its
 * total by more than a rupee — a plugin's own adjustment — says so.
 *
 * Paid is WooCommerce's `date_paid`; a completed cash-on-delivery order with
 * none was paid when it was completed, and a processing one is `confirmed`,
 * the status that exists for exactly that. Refunds are `refunded` payment
 * rows, notes are staff notes (a note that was sent to the customer says so),
 * and every order gets one history line naming where it came from.
 */
class OrdersStep extends Step
{
    private const STATUS = [
        'pending' => OrderStatus::PendingPayment,
        'on-hold' => OrderStatus::PendingPayment,
        'processing' => OrderStatus::Processing,
        'completed' => OrderStatus::Completed,
        'cancelled' => OrderStatus::Cancelled,
        'failed' => OrderStatus::Cancelled,
        'refunded' => OrderStatus::Refunded,
    ];

    public function key(): string
    {
        return 'orders';
    }

    public function label(): string
    {
        return 'Orders';
    }

    public function section(): string
    {
        return 'customers';
    }

    public function mapType(): ?string
    {
        return 'order';
    }

    public function plan(Context $ctx, array $record): Outcome
    {
        $number = trim((string) ($record['number'] ?? $record['id'] ?? ''));
        $label = 'WC-'.$number;
        $wcStatus = (string) ($record['status'] ?? '');

        if (in_array($wcStatus, ['checkout-draft', 'trash', 'auto-draft'], true)) {
            return Outcome::skip($label, 'An abandoned checkout, never placed.');
        }

        if (strtoupper((string) ($record['currency'] ?? 'INR')) !== 'INR') {
            return Outcome::skip($label, 'Placed in '.($record['currency'] ?? '?').'; this store records rupees only.');
        }

        $email = strtolower(trim((string) ($record['billing']['email'] ?? '')));

        if ($email === '' && ! empty($record['customer_id'])) {
            $email = strtolower((string) ($ctx->record('customers', $record['customer_id'])['email'] ?? ''));
        }

        if ($email === '') {
            return Outcome::skip($label, 'Has no email address, which every order here carries.');
        }

        $totals = $this->totals($record);

        if ($totals === null) {
            return Outcome::skip($label, 'Its amounts could not be read.');
        }

        $existing = $ctx->map->model('order', $record['id'], Order::class);
        $outcome = Outcome::upsert($existing !== null, $label, ['existing' => $existing?->id, 'email' => $email, 'number' => $label] + $totals);

        if (! isset(self::STATUS[$wcStatus])) {
            $outcome->warn('Had a status a plugin added; imported as processing.');
        }

        if ($wcStatus === 'failed') {
            $outcome->warn('Its payment failed on the old site; imported as cancelled.');
        }

        if (abs($totals['subtotal'] - $totals['discount'] - $totals['total']) > 100) {
            $outcome->warn('Its lines do not add up to its total (a plugin adjusted it); the total is kept as charged.');
        }

        if (count((array) ($record['coupon_lines'] ?? [])) > 1) {
            $outcome->warn('Used more than one coupon; the first is named on the order and every use is recorded.');
        }

        foreach ((array) ($record['line_items'] ?? []) as $line) {
            if (! empty($line['product_id']) && ! $ctx->map->has('product', $line['product_id'])) {
                $outcome->warn('Has a line for a product that is not being imported; the line keeps its name and price.');

                break;
            }
        }

        return $outcome;
    }

    public function write(Context $ctx, array $record, Outcome $outcome): void
    {
        $data = $outcome->data;
        [$status, $paidAt] = $this->state($record);
        $billing = WooAddress::from($record['billing'] ?? null);
        $shipping = WooAddress::from($record['shipping'] ?? null);
        $gstin = $this->gstin($record);
        $firstCoupon = (array) (((array) ($record['coupon_lines'] ?? []))[0] ?? []);
        $couponCode = strtoupper(trim((string) ($firstCoupon['code'] ?? ''))) ?: null;

        $values = [
            'order_number' => $data['number'],
            'customer_id' => ! empty($record['customer_id']) ? $ctx->map->targetId('customer', $record['customer_id']) : null,
            'status' => $status,
            'payment_method' => $this->method($record),
            'subtotal_paise' => $data['subtotal'],
            'discount_paise' => $data['discount'],
            'taxable_paise' => max(0, $data['total'] - $data['tax']),
            'gst_paise' => $data['tax'],
            'total_paise' => $data['total'],
            'coupon_id' => $couponCode ? Coupon::query()->where('code', $couponCode)->value('id') : null,
            'coupon_code' => $couponCode,
            'customer_name' => WooAddress::name($record['billing'] ?? null) ?? Str::before($data['email'], '@'),
            'customer_email' => $data['email'],
            'customer_phone' => Str::limit(trim((string) ($record['billing']['phone'] ?? '')), 32, '') ?: null,
            'customer_note' => trim((string) ($record['customer_note'] ?? '')) ?: null,
            'billing_address' => $billing,
            // Only an order that shipped has a delivery address; one with none given went to the billing address.
            'shipping_address' => empty($record['shipping_lines']) ? $shipping : ($shipping ?? $billing),
            'gst_required' => $gstin !== null,
            'gstin' => $gstin,
            'company_name' => Str::limit(trim((string) ($record['billing']['company'] ?? '')), 190, '') ?: null,
            'placed_at' => self::date($record['date_created_gmt'] ?? null),
            'paid_at' => $paidAt,
            'completed_at' => $status === OrderStatus::Completed ? self::date($record['date_completed_gmt'] ?? null) : null,
            'cancelled_at' => $status === OrderStatus::Cancelled ? self::date($record['date_modified_gmt'] ?? null) : null,
        ];

        $order = $data['existing'] ? Order::query()->find($data['existing']) : null;

        if ($order === null) {
            $order = new Order;
            $order->fill($values);
            $order->forceFill(['review_requested_at' => now(), 'created_at' => $values['placed_at'] ?? now()]);
            $order->save();
        } else {
            // Quietly: a status that moved on the old site is not news for a webhook here.
            $order->fill($values)->saveQuietly();
            $order->items()->delete();
            $order->payments()->where('reference', 'like', 'WooCommerce %')->delete();
            OrderNote::query()->where('order_id', $order->id)->where('actor_name', 'like', 'WordPress%')->delete();
            CouponUsage::query()->where('order_id', $order->id)->delete();
        }

        foreach ($data['lines'] as $line) {
            $product = $line['_product'] ?? null;
            $variation = $line['_variation'] ?? null;
            unset($line['_product'], $line['_variation']);

            $order->items()->create($line + [
                'store_product_id' => $product !== null ? $ctx->map->targetId('product', $product) : null,
                'store_product_variation_id' => $variation !== null ? $ctx->map->targetId('variation', $variation) : null,
            ]);
        }

        $this->payments($order, $record, $paidAt, $data['total']);
        $this->couponUses($order, $record, $data['email']);
        $this->notes($ctx, $order, $record);

        if ($outcome->action === Outcome::CREATE) {
            OrderStatusEvent::query()->create([
                'order_id' => $order->id,
                'to_status' => $status->value,
                'note' => 'Imported from WordPress (WooCommerce order #'.($record['number'] ?? $record['id']).').',
                'actor_name' => 'WordPress import',
            ]);
        }

        $ctx->map->put('order', $record['id'], $order);
    }

    /**
     * The order's lines and totals in paise, or null when an amount cannot be read.
     *
     * @return ?array{lines: list<array<string, mixed>>, subtotal: int, discount: int, tax: int, total: int}
     */
    private function totals(array $record): ?array
    {
        $lines = [];
        $discount = 0;

        foreach ((array) ($record['line_items'] ?? []) as $item) {
            $net = Prices::recorded($item['subtotal'] ?? '0');
            $tax = Prices::recorded($item['subtotal_tax'] ?? '0');
            $quantity = max(1, (int) ($item['quantity'] ?? 1));

            if ($net === null || $tax === null) {
                return null;
            }

            $lineTotal = max(0, $net + $tax);
            $options = $this->options($item);

            $lines[] = [
                'name' => Str::limit(trim(html_entity_decode((string) ($item['name'] ?? 'Item'), ENT_QUOTES)), 250, ''),
                'variation_name' => $options === [] ? null : Str::limit(implode(' / ', $options), 190, ''),
                'sku' => Str::limit((string) ($item['sku'] ?? ''), 190, '') ?: null,
                'options' => $options,
                'type' => ProductType::Physical,
                'quantity' => $quantity,
                'unit_price_paise' => intdiv($lineTotal + intdiv($quantity, 2), $quantity),
                'line_total_paise' => $lineTotal,
                'returnable' => true,
                '_product' => ! empty($item['product_id']) ? (int) $item['product_id'] : null,
                '_variation' => ! empty($item['variation_id']) ? (int) $item['variation_id'] : null,
            ];
        }

        foreach ((array) ($record['shipping_lines'] ?? []) as $ship) {
            $amount = (Prices::recorded($ship['total'] ?? '0') ?? 0) + (Prices::recorded($ship['total_tax'] ?? '0') ?? 0);

            if ($amount > 0) {
                $lines[] = self::serviceLine('Shipping — '.trim((string) ($ship['method_title'] ?? 'Delivery')), $amount);
            }
        }

        foreach ((array) ($record['fee_lines'] ?? []) as $fee) {
            $amount = (Prices::recorded($fee['total'] ?? '0') ?? 0) + (Prices::recorded($fee['total_tax'] ?? '0') ?? 0);

            // A negative fee is a discount by another name.
            if ($amount >= 0) {
                $lines[] = self::serviceLine(trim((string) ($fee['name'] ?? 'Fee')), $amount);
            } else {
                $discount += -$amount;
            }
        }

        $discount += (Prices::recorded($record['discount_total'] ?? '0') ?? 0) + (Prices::recorded($record['discount_tax'] ?? '0') ?? 0);
        $total = Prices::recorded($record['total'] ?? '0');
        $tax = Prices::recorded($record['total_tax'] ?? '0');

        if ($total === null || $tax === null) {
            return null;
        }

        return [
            'lines' => $lines,
            'subtotal' => array_sum(array_column($lines, 'line_total_paise')),
            'discount' => max(0, $discount),
            'tax' => max(0, $tax),
            'total' => max(0, $total),
        ];
    }

    /** @return array<string, mixed> */
    private static function serviceLine(string $name, int $amount): array
    {
        return [
            'name' => Str::limit($name, 250, ''),
            'variation_name' => null,
            'sku' => null,
            'options' => [],
            'type' => ProductType::Service,
            'quantity' => 1,
            'unit_price_paise' => $amount,
            'line_total_paise' => $amount,
            'returnable' => false,
        ];
    }

    /** @return array<string, string> the attributes a line was bought with, as WooCommerce displays them */
    private function options(array $item): array
    {
        $options = [];

        foreach ((array) ($item['meta_data'] ?? []) as $meta) {
            $key = (string) ($meta['display_key'] ?? $meta['key'] ?? '');

            if ($key === '' || str_starts_with($key, '_') || ! is_scalar($meta['display_value'] ?? $meta['value'] ?? null)) {
                continue;
            }

            $options[Str::limit(strip_tags($key), 80, '')] = Str::limit(strip_tags((string) ($meta['display_value'] ?? $meta['value'])), 190, '');
        }

        return $options;
    }

    /** @return array{0: OrderStatus, 1: ?CarbonImmutable} */
    private function state(array $record): array
    {
        $status = self::STATUS[$record['status'] ?? ''] ?? OrderStatus::Processing;
        $paidAt = self::date($record['date_paid_gmt'] ?? null);
        $cod = ($record['payment_method'] ?? '') === 'cod';

        if ($cod && $paidAt === null && $status === OrderStatus::Completed) {
            $paidAt = self::date($record['date_completed_gmt'] ?? null) ?? self::date($record['date_modified_gmt'] ?? null);
        }

        if ($cod && $paidAt === null && $status === OrderStatus::Processing) {
            $status = OrderStatus::Confirmed;
        }

        // "Paid" has one definition here — `paid_at` — and a paid-looking status without it would contradict it.
        if ($paidAt === null && in_array($status, [OrderStatus::Processing, OrderStatus::Completed, OrderStatus::Refunded], true)) {
            $paidAt = self::date($record['date_created_gmt'] ?? null);
        }

        return [$status, $paidAt];
    }

    private function method(array $record): PaymentMethod
    {
        $slug = strtolower((string) ($record['payment_method'] ?? ''));

        return match (true) {
            $slug === 'cod' => PaymentMethod::Cod,
            in_array($slug, ['bacs', 'cheque'], true) => PaymentMethod::BankTransfer,
            str_contains($slug, 'upi') => PaymentMethod::Upi,
            default => PaymentMethod::Gateway,
        };
    }

    private function payments(Order $order, array $record, ?CarbonImmutable $paidAt, int $total): void
    {
        if ($paidAt !== null) {
            $transaction = trim((string) ($record['transaction_id'] ?? '')) ?: null;

            // The unique index is the idempotency of live payments; an old id already on file stays a reference only.
            if ($transaction !== null && Payment::query()->where('gateway_payment_id', $transaction)->exists()) {
                $transaction = null;
            }

            $order->payments()->create([
                'gateway' => Str::limit(strtolower((string) ($record['payment_method'] ?? 'woocommerce')) ?: 'woocommerce', 32, ''),
                'gateway_payment_id' => $transaction !== null ? Str::limit($transaction, 190, '') : null,
                'reference' => 'WooCommerce order #'.($record['number'] ?? $record['id']),
                'amount_paise' => $total,
                'currency' => 'INR',
                'status' => PaymentStatus::Paid,
                'method' => Str::limit((string) ($record['payment_method_title'] ?? ''), 64, '') ?: null,
                'paid_at' => $paidAt,
                'note' => 'Imported from WordPress.',
            ]);
        }

        foreach ((array) ($record['refunds'] ?? []) as $refund) {
            $amount = abs((int) (Prices::recorded($refund['total'] ?? '0') ?? 0));

            if ($amount === 0) {
                continue;
            }

            $order->payments()->create([
                'gateway' => 'woocommerce',
                'reference' => 'WooCommerce refund #'.($refund['id'] ?? '?'),
                'amount_paise' => $amount,
                'currency' => 'INR',
                'status' => PaymentStatus::Refunded,
                'note' => Str::limit(trim((string) ($refund['reason'] ?? '')) ?: 'Refund imported from WordPress.', 250, ''),
            ]);
        }
    }

    private function couponUses(Order $order, array $record, string $email): void
    {
        foreach ((array) ($record['coupon_lines'] ?? []) as $line) {
            $coupon = Coupon::query()->where('code', strtoupper(trim((string) ($line['code'] ?? ''))))->first();

            if ($coupon === null || $order->status === OrderStatus::Cancelled && $order->paid_at === null) {
                continue;
            }

            CouponUsage::query()->create([
                'coupon_id' => $coupon->id,
                'order_id' => $order->id,
                'email' => $email,
                'discount_paise' => (Prices::recorded($line['discount'] ?? '0') ?? 0) + (Prices::recorded($line['discount_tax'] ?? '0') ?? 0),
            ]);
        }
    }

    private function notes(Context $ctx, Order $order, array $record): void
    {
        foreach ($ctx->children('order_notes', $record['id']) as $note) {
            $text = trim(strip_tags(html_entity_decode((string) ($note['note'] ?? ''), ENT_QUOTES)));

            if ($text === '') {
                continue;
            }

            $row = OrderNote::query()->create([
                'order_id' => $order->id,
                'actor_name' => Str::limit('WordPress · '.(trim((string) ($note['author'] ?? '')) ?: 'system'), 120, ''),
                'body' => (! empty($note['customer_note']) ? '[Sent to the customer] ' : '').Str::limit($text, 4000, ''),
            ]);

            if ($date = self::date($note['date_created_gmt'] ?? null)) {
                $row->forceFill(['created_at' => $date, 'updated_at' => $date])->saveQuietly();
            }
        }
    }

    private function gstin(array $record): ?string
    {
        foreach ((array) ($record['meta_data'] ?? []) as $meta) {
            $key = strtolower((string) ($meta['key'] ?? ''));

            if ((str_contains($key, 'gstin') || str_contains($key, 'gst_number')) && is_string($meta['value'] ?? null)) {
                $value = strtoupper(preg_replace('/\s+/', '', $meta['value']));

                if (preg_match('/^[0-9A-Z]{15}$/', $value)) {
                    return $value;
                }
            }
        }

        return null;
    }
}
