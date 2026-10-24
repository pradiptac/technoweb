<?php

namespace App\Enums;

/**
 * How a slide's picture fills the frame. Set per slide.
 *
 * `Cover` is the default and is what every slide has done: fill the frame and
 * crop around the focal point. Sent as `meta.fits`, never listed in TypeScript.
 */
enum SlideFit: string
{
    case Cover = 'cover';
    case Contain = 'contain';

    public function label(): string
    {
        return match ($this) {
            self::Cover => 'Fill the frame',
            self::Contain => 'Show the whole picture',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::Cover => 'The picture fills the frame and is cropped around its focal point. The default.',
            self::Contain => 'The whole picture, with a soft blurred copy filling the space around it.',
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
