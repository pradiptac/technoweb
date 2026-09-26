<?php

namespace App\Support\WordPress\Steps;

use App\Models\Coupon;
use App\Support\WordPress\Context;
use App\Support\WordPress\Outcome;
use App\Support\WordPress\Prices;
use Illuminate\Support\Str;

/**
 * WooCommerce coupons, as discount codes.
 *
 * A percentage off the basket and a fixed amount off the basket map
 * directly; a fixed amount off each product does not (the store discounts
 * baskets) and is skipped. The conditions a code here cannot express —
 * which products or categories it applies to, which addresses may use it,
 * free shipping, "not on sale items", a maximum spend — are dropped and
 * named on the code, so nobody finds out from a customer that a code
 * restricted to one product now works on everything. Usage history arrives
 * with the orders that used it (`coupon_usages` rows), which is what the
 * limits count.
 */
class CouponsStep extends Step
{
    public function key(): string
    {
        return 'coupons';
    }

    public function label(): string
    {
        return 'Coupons';
    }

    public function section(): string
    {
        return 'customers';
    }

    public function mapType(): ?string
    {
        return 'coupon';
    }

    public function applies(Context $ctx): bool
    {
        return parent::applies($ctx) && in_array((string) $ctx->wc('woocommerce_currency', 'INR'), ['', 'INR'], true);
    }

    public function plan(Context $ctx, array $record): Outcome
    {
        $code = strtoupper(trim((string) ($record['code'] ?? '')));

        if ($code === '' || mb_strlen($code) > 64) {
            return Outcome::skip($code ?: '(no code)', 'Has no usable code.');
        }

        $type = match ($record['discount_type'] ?? '') {
            'percent' => 'percentage',
            'fixed_cart' => 'fixed',
            default => null,
        };

        if ($type === null) {
            return Outcome::skip($code, 'A fixed discount on each product; codes here discount the basket.');
        }

        $amount = trim((string) ($record['amount'] ?? '0'));
        $value = $type === 'percentage' ? (int) round((float) $amount) : Prices::recorded($amount);

        if ($value === null || $value <= 0 || ($type === 'percentage' && $value > 100)) {
            return Outcome::skip($code, 'Its amount could not be read.');
        }

        $existing = $ctx->map->model('coupon', $record['id'], Coupon::class) ?? Coupon::query()->where('code', $code)->first();
        $outcome = Outcome::upsert($existing !== null, $code, ['code' => $code, 'type' => $type, 'value' => $value, 'existing' => $existing?->id]);

        if ($type === 'percentage' && (float) $amount !== (float) $value) {
            $outcome->warn('Its percentage had decimals; rounded to a whole number.');
        }

        $dropped = array_filter([
            ! empty($record['product_ids']) || ! empty($record['excluded_product_ids']) ? 'which products it applies to' : null,
            ! empty($record['product_categories']) || ! empty($record['excluded_product_categories']) ? 'which categories it applies to' : null,
            ! empty($record['email_restrictions']) ? 'which addresses may use it' : null,
            ! empty($record['free_shipping']) ? 'free shipping' : null,
            ! empty($record['exclude_sale_items']) ? 'not on sale items' : null,
            trim((string) ($record['maximum_amount'] ?? '')) !== '' ? 'a maximum spend' : null,
        ]);

        foreach ($dropped as $condition) {
            $outcome->warn("Imported without its condition: {$condition}.");
        }

        return $outcome;
    }

    public function write(Context $ctx, array $record, Outcome $outcome): void
    {
        $values = [
            'code' => $outcome->data['code'],
            'type' => $outcome->data['type'],
            'value' => $outcome->data['value'],
            'minimum_order_paise' => ($min = Prices::recorded($record['minimum_amount'] ?? '')) ? $min : null,
            'ends_at' => self::date($record['date_expires_gmt'] ?? null),
            'usage_limit' => ($limit = (int) ($record['usage_limit'] ?? 0)) > 0 ? $limit : null,
            'per_customer_limit' => ($per = (int) ($record['usage_limit_per_user'] ?? 0)) > 0 ? $per : null,
            'is_active' => ($record['status'] ?? 'publish') === 'publish',
            'description' => Str::limit(self::text($record['description'] ?? ''), 250, '') ?: null,
        ];

        $coupon = $outcome->data['existing'] ? Coupon::query()->find($outcome->data['existing']) : null;
        if ($coupon === null) {
            $coupon = Coupon::query()->create($values);
        } else {
            $coupon->update($values);
        }

        $ctx->map->put('coupon', $record['id'], $coupon);
    }
}
