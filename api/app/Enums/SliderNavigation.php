<?php

namespace App\Enums;

/**
 * What a slider shows to move between slides. Set per slider.
 *
 * `Dots` is the default: it is what every slider showed before this setting
 * existed. Sent as `meta.navigations`, never listed in TypeScript.
 */
enum SliderNavigation: string
{
    case Dots = 'dots';
    case Progress = 'progress';
    case Thumbnails = 'thumbnails';
    case None = 'none';

    public function label(): string
    {
        return match ($this) {
            self::Dots => 'Dots',
            self::Progress => 'Dots and progress line',
            self::Thumbnails => 'Thumbnails',
            self::None => 'Arrows only',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::Dots => 'A row of dots under the slider, one per slide. The default.',
            self::Progress => 'The dots, plus a thin line that fills while the current slide is showing.',
            self::Thumbnails => 'A strip of small pictures under the slider, one per slide.',
            self::None => 'No dots or thumbnails; the arrows and the pause button remain.',
        };
    }

    /**
     * The list, as the console renders it.
     *
     * @return list<array{value: string, label: string, blurb: string}>
     */
    public static function options(): array
    {
        return array_map(fn (self $c) => [
            'value' => $c->value,
            'label' => $c->label(),
            'blurb' => $c->blurb(),
        ], self::cases());
    }
}
