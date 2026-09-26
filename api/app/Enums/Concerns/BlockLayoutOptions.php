<?php

namespace App\Enums\Concerns;

/**
 * `options()` for the four content-block layout enums, in the shape
 * `SliderLayout::options()` already sends — value, label and blurb — so the
 * console draws its layout tiles from the API's list and never a copy.
 */
trait BlockLayoutOptions
{
    abstract public function label(): string;

    abstract public function blurb(): string;

    /** @return list<array{value: string, label: string, blurb: string}> */
    public static function options(): array
    {
        return array_map(fn (self $c) => [
            'value' => $c->value,
            'label' => $c->label(),
            'blurb' => $c->blurb(),
        ], self::cases());
    }
}
