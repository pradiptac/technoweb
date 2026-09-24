<?php

namespace App\Enums;

/**
 * One subscriber's place in a sequence.
 *
 * `Active` is waiting for the next step; `Completed` has had the last one;
 * `Cancelled` was stopped — by a person, or by the runner finding the
 * subscriber no longer mailable, in which case `cancelled_reason` says so.
 * None of them goes back to `Active`: an enrolment is once per subscriber,
 * and a cancelled one is the record that they were not to be mailed.
 */
enum EnrolmentStatus: string
{
    case Active = 'active';
    case Completed = 'completed';
    case Cancelled = 'cancelled';

    public function label(): string
    {
        return match ($this) {
            self::Active => 'Active',
            self::Completed => 'Completed',
            self::Cancelled => 'Cancelled',
        };
    }

    public static function options(): array
    {
        return array_map(fn (self $c) => ['value' => $c->value, 'label' => $c->label()], self::cases());
    }
}
