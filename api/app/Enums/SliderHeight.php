<?php

namespace App\Enums;

/**
 * How tall a slider is. Set per slider.
 *
 * `Theme` is the default: the theme's own shape, which is now also capped at the
 * visible screen. `Fixed` uses `height_mobile` and `height_desktop`, each one of
 * `steps()`, and both are required (and stored) only for `Fixed`.
 * Sent as `meta.heights` and `meta.height_steps`, never listed in TypeScript.
 */
enum SliderHeight: string
{
    case Theme = 'theme';
    case Screen = 'screen';
    case Fixed = 'fixed';

    public function label(): string
    {
        return match ($this) {
            self::Theme => 'The theme\'s shape',
            self::Screen => 'Fill the screen',
            self::Fixed => 'Choose a height',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::Theme => 'The shape the theme gives the slider, never taller than the screen. The default.',
            self::Screen => 'The slider is exactly the height of the visible screen below the header.',
            self::Fixed => 'Pick a height for phones and another for larger screens.',
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

    /** The two fixed heights' steps, tallest last. */
    public const STEPS = ['short', 'medium', 'tall'];

    /**
     * @return list<array{value: string, label: string}>
     */
    public static function steps(): array
    {
        return array_map(fn (string $s) => ['value' => $s, 'label' => ucfirst($s)], self::STEPS);
    }
}
