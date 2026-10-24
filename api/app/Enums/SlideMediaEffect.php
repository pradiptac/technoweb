<?php

namespace App\Enums;

/**
 * The slow zoom on a slide's picture (the "Ken Burns" motion). Set per slider.
 *
 * `None` is the default: the picture has always stood still, so an untouched
 * slider renders as before. Sent as `meta.media_effects`, never listed in TypeScript.
 */
enum SlideMediaEffect: string
{
    case None = 'none';
    case ZoomIn = 'zoom_in';
    case ZoomOut = 'zoom_out';
    case Drift = 'drift';

    public function label(): string
    {
        return match ($this) {
            self::None => 'None',
            self::ZoomIn => 'Zoom in',
            self::ZoomOut => 'Zoom out',
            self::Drift => 'Drift',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::None => 'The picture stands still. The default, and what every slider did before this setting existed.',
            self::ZoomIn => 'The picture slowly grows while its slide is showing.',
            self::ZoomOut => 'The picture starts a little larger and slowly settles back.',
            self::Drift => 'The picture slowly grows while sliding a little to one side.',
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
