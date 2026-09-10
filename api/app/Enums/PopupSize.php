<?php

namespace App\Enums;

/**
 * How wide a popup renders.
 *
 * Three presets rather than a number in a box. An editor designing artwork
 * wants a size to design *against*, and a free field is one somebody puts 4000
 * into — which on a phone is a picture nobody can see the edges of. Each width
 * is also capped to the viewport by the renderer, so the preset decides the
 * ceiling and the screen decides the rest.
 */
enum PopupSize: string
{
    case Small = 'small';
    case Medium = 'medium';
    case Large = 'large';

    public function label(): string
    {
        return match ($this) {
            self::Small => 'Small',
            self::Medium => 'Medium',
            self::Large => 'Large',
        };
    }

    /** The ceiling in CSS pixels, which is also what artwork should be drawn to. */
    public function width(): int
    {
        return match ($this) {
            self::Small => 420,
            self::Medium => 560,
            self::Large => 760,
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::Small => 'A notice. 420px wide — draw the artwork at 840px for a sharp render.',
            self::Medium => 'The usual choice. 560px wide — draw the artwork at 1120px.',
            self::Large => 'A full offer with detail in it. 760px wide — draw the artwork at 1520px.',
        };
    }

    /**
     * The options, for the console.
     *
     * Sent by the API rather than listed in TypeScript, the rule
     * `schema_type_options` and `meta.transitions` already follow: two
     * hand-written copies of one list of strings is exactly the drift nothing
     * type-checks across the wire.
     *
     * @return array<int, array{value: string, label: string, blurb: string, width: int}>
     */
    public static function options(): array
    {
        return array_map(fn (self $c) => [
            'value' => $c->value,
            'label' => $c->label(),
            'blurb' => $c->blurb(),
            'width' => $c->width(),
        ], self::cases());
    }
}
