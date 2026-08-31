<?php

namespace App\Http\Resources\Admin\Store;

use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The console's view of a coupon.
 *
 * `value` stays in its raw form — paise or a percentage, depending on `type` —
 * and the label is sent alongside, so the screen renders "10% off" or "₹500
 * off" without deciding what the number means. Two places deciding that is how
 * one of them gets it wrong.
 */
class CouponResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'type' => $this->type,
            'value' => $this->value,
            'label' => $this->label(),
            'minimum_order_paise' => $this->minimum_order_paise,
            'maximum_discount_paise' => $this->maximum_discount_paise,
            'starts_at' => $this->starts_at?->toIso8601String(),
            'ends_at' => $this->ends_at?->toIso8601String(),
            'usage_limit' => $this->usage_limit,
            'per_customer_limit' => $this->per_customer_limit,
            'is_active' => (bool) $this->is_active,
            'description' => $this->description,
            'usages_count' => $this->whenCounted('usages'),
            /*
             * What this code has actually cost, which is the figure somebody
             * running a promotion asks for and the one a usage *count* cannot
             * answer: ten uses of a percentage code on ten different baskets
             * are ten different amounts.
             */
            'total_given' => $this->whenCounted(
                'usages',
                fn () => Money::format((int) $this->usages()->sum('discount_paise')),
            ),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
