<?php

namespace App\Enums;

/**
 * Where one activation code is in its short life.
 *
 * `Reserved` exists for the gap between deciding a code is somebody's and
 * having actually told them — a queued delivery, a payment being settled, a
 * transaction that has not committed. Without it the only two states are
 * "anybody may have this" and "sold", and the moment in between is where the
 * same licence goes to two customers.
 */
enum DigitalCodeStatus: string
{
    case Available = 'available';
    case Reserved = 'reserved';
    case Delivered = 'delivered';
    case Cancelled = 'cancelled';

    public function label(): string
    {
        return match ($this) {
            self::Available => 'Available',
            self::Reserved => 'Reserved',
            self::Delivered => 'Delivered',
            self::Cancelled => 'Cancelled',
        };
    }

    /** Whether this code may still be handed to somebody. */
    public function isSpent(): bool
    {
        return in_array($this, [self::Reserved, self::Delivered], true);
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
