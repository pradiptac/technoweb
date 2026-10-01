<?php

namespace App\Enums;

/**
 * The five answers a closed ticket's survey offers, worst to best.
 *
 * The number is what is stored and what the link carries; the label is what
 * the button says. `colour()` is the button's ground in the email — hexes
 * live here because an email cannot read a CSS variable, and each one is
 * dark enough for white text at 4.5:1 or better (the same rule the site's
 * fills keep), red at one end to green at the other so the scale reads
 * before a word is.
 */
enum SurveyRating: int
{
    case VeryBad = 1;
    case Poor = 2;
    case Average = 3;
    case Good = 4;
    case Excellent = 5;

    public function label(): string
    {
        return match ($this) {
            self::VeryBad => 'Very Bad',
            self::Poor => 'Poor',
            self::Average => 'Average',
            self::Good => 'Good',
            self::Excellent => 'Excellent',
        };
    }

    public function colour(): string
    {
        return match ($this) {
            self::VeryBad => '#b3261e',
            self::Poor => '#c2410c',
            self::Average => '#a16207',
            self::Good => '#15803d',
            self::Excellent => '#166534',
        };
    }

    /** @return list<array{value: int, label: string}> */
    public static function options(): array
    {
        return array_map(fn (self $r) => ['value' => $r->value, 'label' => $r->label()], self::cases());
    }
}
