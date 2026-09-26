<?php

namespace App\Enums;

/**
 * One message on one channel to one contact, from queued to read.
 *
 * `pending` until the worker sends it; `sent` once the provider accepted it;
 * `delivered` and `read` only when the provider's webhook says so, never
 * inferred. `skipped` is a message the worker decided not to send — the
 * contact opted out after it was queued, the channel was switched off, the
 * template lost its approval — and is not a failure: nothing was attempted.
 *
 * A status only moves forward (`rank()`), because a provider's callbacks
 * arrive out of order — a `delivered` landing after the `read` it preceded
 * must not walk the row back.
 */
enum MessageDeliveryStatus: string
{
    case Pending = 'pending';
    case Sent = 'sent';
    case Delivered = 'delivered';
    case Read = 'read';
    case Failed = 'failed';
    case Skipped = 'skipped';

    public function label(): string
    {
        return match ($this) {
            self::Pending => 'Waiting',
            self::Sent => 'Sent',
            self::Delivered => 'Delivered',
            self::Read => 'Read',
            self::Failed => 'Failed',
            self::Skipped => 'Skipped',
        };
    }

    public function rank(): int
    {
        return match ($this) {
            self::Pending => 0,
            self::Sent => 1,
            self::Delivered => 2,
            self::Read => 3,
            self::Failed, self::Skipped => 4,
        };
    }

    public static function options(): array
    {
        return array_map(fn (self $c) => ['value' => $c->value, 'label' => $c->label()], self::cases());
    }
}
