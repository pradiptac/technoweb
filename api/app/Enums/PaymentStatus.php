<?php

namespace App\Enums;

/**
 * Where one payment attempt got to.
 *
 * Separate from `OrderStatus` because they answer different questions and are
 * not in step: an order can be `paid` while carrying two `failed` payments,
 * which is the ordinary shape of somebody's card being declined once. Folding
 * them into one column would lose the attempts, and the attempts are what a
 * customer is asking about when they say the money left their account.
 */
enum PaymentStatus: string
{
    case Pending = 'pending';
    case Processing = 'processing';
    case Paid = 'paid';
    case Failed = 'failed';
    case Cancelled = 'cancelled';
    case Refunded = 'refunded';
    case PartiallyRefunded = 'partially_refunded';

    public function label(): string
    {
        return match ($this) {
            self::Pending => 'Pending',
            self::Processing => 'Processing',
            self::Paid => 'Paid',
            self::Failed => 'Failed',
            self::Cancelled => 'Cancelled',
            self::Refunded => 'Refunded',
            self::PartiallyRefunded => 'Partially refunded',
        };
    }

    /** Whether this attempt is the one that settled the order. */
    public function isSettled(): bool
    {
        return in_array($this, [self::Paid, self::Refunded, self::PartiallyRefunded], true);
    }

    /** @return array<int, array<string, string>> */
    public static function options(): array
    {
        return array_map(
            fn (self $c) => ['value' => $c->value, 'label' => $c->label()],
            self::cases(),
        );
    }
}
