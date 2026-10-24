<?php

namespace App\Enums;

/**
 * How far the shade behind a slide's words reaches. Set per slide.
 *
 * `Standard` is the default and is what every slide has had. Sent as
 * `meta.overlays`, never listed in TypeScript.
 */
enum SlideOverlay: string
{
    case Soft = 'soft';
    case Standard = 'standard';
    case Strong = 'strong';

    public function label(): string
    {
        return match ($this) {
            self::Soft => 'Soft',
            self::Standard => 'Standard',
            self::Strong => 'Strong',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::Soft => 'A light shade that stays close to the words.',
            self::Standard => 'The usual shade. The default.',
            self::Strong => 'A heavier shade that reaches further up the picture, for busy photographs.',
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
