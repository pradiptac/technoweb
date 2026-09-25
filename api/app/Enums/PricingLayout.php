<?php

namespace App\Enums;

use App\Enums\Concerns\BlockLayoutOptions;

/**
 * The pricing layouts (the client, 2026-09-24, from vibeprompts.dev/pricing).
 * Display only: every plan's button is a link — nothing here can be bought,
 * subscribed to or quoted, the brief's scope limits.
 */
enum PricingLayout: string
{
    use BlockLayoutOptions;
    case ThreeTier = 'three_tier';
    case Comparison = 'comparison';
    case SingleFocus = 'single_focus';

    public function label(): string
    {
        return match ($this) {
            self::ThreeTier => 'Three-tier with highlight',
            self::Comparison => 'Comparison table',
            self::SingleFocus => 'Single plan focus',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::ThreeTier => 'Plans side by side, each with a price, a line, a list of features and a button; the plan you mark is raised and highlighted.',
            self::Comparison => 'Plans as columns and features as rows, each cell a tick, a cross or a short text, grouped under headings if you like.',
            self::SingleFocus => 'One plan, large, with its features and a button — the first plan in each set.',
        };
    }
}
