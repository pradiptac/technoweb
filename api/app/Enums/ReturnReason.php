<?php

namespace App\Enums;

/**
 * Why something is coming back. A short fixed list, because the desk sorts
 * and counts by it; the customer's own words go in `details` beside it.
 */
enum ReturnReason: string
{
    case Damaged = 'damaged';
    case Faulty = 'faulty';
    case WrongItem = 'wrong_item';
    case NotAsDescribed = 'not_as_described';
    case NoLongerNeeded = 'no_longer_needed';
    case Other = 'other';

    public function label(): string
    {
        return match ($this) {
            self::Damaged => 'Arrived damaged',
            self::Faulty => 'Faulty or not working',
            self::WrongItem => 'Wrong item sent',
            self::NotAsDescribed => 'Not as described',
            self::NoLongerNeeded => 'No longer needed',
            self::Other => 'Something else',
        };
    }

    /** @return array<int, array{value: string, label: string}> */
    public static function options(): array
    {
        return array_map(fn (self $r) => ['value' => $r->value, 'label' => $r->label()], self::cases());
    }
}
