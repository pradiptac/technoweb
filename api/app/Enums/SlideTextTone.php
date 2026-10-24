<?php

namespace App\Enums;

/**
 * The colour of a slide's words, and so of the shade behind them. Set per slide.
 *
 * `Light` is the default: white words on the dark shade every slide has had.
 * Sent as `meta.text_tones`, never listed in TypeScript.
 */
enum SlideTextTone: string
{
    case Light = 'light';
    case Dark = 'dark';

    public function label(): string
    {
        return match ($this) {
            self::Light => 'Light words',
            self::Dark => 'Dark words',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::Light => 'White words on a dark shade. The default; use it on most pictures.',
            self::Dark => 'Dark words on a light shade, for a bright or pale picture.',
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
