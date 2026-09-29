<?php

namespace App\Enums;

/**
 * Which door a meeting was booked through: the public page, the customer
 * portal, or the console on somebody's behalf.
 *
 * It decides two things beyond the record: a console booking may skip the
 * notice and the booking window (docs/meetings.md), and a console booking
 * for an existing customer files no lead.
 */
enum MeetingSource: string
{
    case Site = 'site';
    case Portal = 'portal';
    case Console = 'console';

    public function label(): string
    {
        return match ($this) {
            self::Site => 'Website',
            self::Portal => 'Customer portal',
            self::Console => 'Console',
        };
    }

    /** @return array<int, array{value: string, label: string}> */
    public static function options(): array
    {
        return array_map(fn (self $c) => ['value' => $c->value, 'label' => $c->label()], self::cases());
    }
}
