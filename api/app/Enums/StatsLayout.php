<?php

namespace App\Enums;

use App\Enums\Concerns\BlockLayoutOptions;

/**
 * The stat bar layouts (the client, 2026-09-24, from vibeprompts.dev/stats and
 * ui.watermelon.sh). The homepage hero and support statistics are settings
 * and are not these — they stay exactly as they were.
 */
enum StatsLayout: string
{
    use BlockLayoutOptions;
    case Row = 'row';
    case SparklineCards = 'sparkline_cards';
    case Rings = 'rings';
    case CountUp = 'count_up';
    case PulseStrip = 'pulse_strip';
    case FeatureCards = 'feature_cards';
    case Chips = 'chips';

    public function label(): string
    {
        return match ($this) {
            self::Row => 'Four-figure row',
            self::SparklineCards => 'Metric cards with sparklines',
            self::Rings => 'Ring gauge trio',
            self::CountUp => 'Count-up on view',
            self::PulseStrip => 'Anomaly pulse strip',
            self::FeatureCards => 'Feature cards',
            self::Chips => 'Figures as chips',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::Row => 'Big figures with a label under each, in a row — the look of the homepage hero statistics.',
            self::SparklineCards => 'A card per figure with a small bar chart of its recent trend and the change beside it.',
            self::Rings => 'Three rings, each filled to a percentage, with the figure in the middle. Exactly three figures, each needing a percentage.',
            self::CountUp => 'Figures that count up from zero the first time they scroll into view, then stay.',
            self::PulseStrip => 'A strip of figures where the ones you mark as unusual pulse gently and show their change, so they stand out without losing the rest.',
            self::FeatureCards => 'A large heading with a highlighted second line, then cards each with a badge, a big figure, a short label and a sentence. Built for teams that ship relentlessly.',
            self::Chips => 'A heading with an underlined phrase, a row of rounded chips each holding an icon, a figure and a label, and a row of recognitions under them. Infrastructure that scales with you.',
        };
    }
}
