<?php

namespace App\Enums;

/**
 * Where a slide's heading, caption and button sit on the picture.
 *
 * Nine anchors — three rows by three columns — set **per slide**, not per
 * slider. That is the whole point of it: a carousel is usually one photograph
 * with its subject on the left followed by another with its subject on the
 * right, and a position fixed for the whole slider puts the words over
 * somebody's face on every second slide. The setting belongs to the picture it
 * has to work with.
 *
 * The options are **sent by the API** and never listed in TypeScript, the rule
 * `SliderTransition`, `GalleryTransition` and `schema_type_options` all follow:
 * two hand-written copies of one list of strings is exactly the drift nothing
 * type-checks across the wire.
 *
 * `BottomLeft` is the default, and it is the behaviour every existing slide
 * already has — the caption has always been a bottom-anchored band with its
 * text ranged left. Defaulting to anything else would move the words on every
 * slider on every install the moment the migration ran, the same reasoning
 * `SliderTransition` defaults to `Slide`.
 */
enum SlideCaptionPosition: string
{
    case TopLeft = 'top-left';
    case TopCentre = 'top-centre';
    case TopRight = 'top-right';
    case MiddleLeft = 'middle-left';
    case MiddleCentre = 'middle-centre';
    case MiddleRight = 'middle-right';
    case BottomLeft = 'bottom-left';
    case BottomCentre = 'bottom-centre';
    case BottomRight = 'bottom-right';

    public function label(): string
    {
        return match ($this) {
            self::TopLeft => 'Top left',
            self::TopCentre => 'Top centre',
            self::TopRight => 'Top right',
            self::MiddleLeft => 'Middle left',
            self::MiddleCentre => 'Middle centre',
            self::MiddleRight => 'Middle right',
            self::BottomLeft => 'Bottom left',
            self::BottomCentre => 'Bottom centre',
            self::BottomRight => 'Bottom right',
        };
    }

    /** The row this anchor sits on, which is what decides the scrim. */
    public function row(): string
    {
        return explode('-', $this->value)[0];
    }

    /**
     * The list, as the console renders it.
     *
     * @return list<array{value: string, label: string}>
     */
    public static function options(): array
    {
        return array_map(fn (self $c) => [
            'value' => $c->value,
            'label' => $c->label(),
        ], self::cases());
    }
}
