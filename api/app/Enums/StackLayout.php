<?php

namespace App\Enums;

use App\Enums\Concerns\BlockLayoutOptions;

/**
 * The technology stack layouts (the client, 2026-09-24, after
 * vengenceui.com's solar system and the styles asked for beside it). One
 * list of technologies in groups; each layout draws the same data.
 */
enum StackLayout: string
{
    use BlockLayoutOptions;
    case Orbit = 'orbit';
    case Grouped = 'grouped';
    case Cloud = 'cloud';
    case Globe = 'globe';
    case Marquee = 'marquee';
    case Layers = 'layers';

    public function label(): string
    {
        return match ($this) {
            self::Orbit => 'Orbit',
            self::Grouped => 'Grouped cards',
            self::Cloud => 'Technology cloud',
            self::Globe => 'Globe',
            self::Marquee => 'Marquee rows',
            self::Layers => 'Layers',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::Orbit => 'Your logo in the middle and the technologies on up to three rings turning at their own speeds; picking one shows its details beside the diagram.',
            self::Grouped => 'Logo cards under each group’s name. The calmest, and the easiest to read on a phone.',
            self::Cloud => 'The names as a cloud, each sized by the importance you give it.',
            self::Globe => 'The logos spread over a slowly turning sphere that can be dragged round.',
            self::Marquee => 'One row of logos per group, scrolling in opposite directions.',
            self::Layers => 'The groups as stacked plates — for example Network, Compute, Security — with their logos on each.',
        };
    }
}
