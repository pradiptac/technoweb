<?php

namespace App\Enums;

/** The shapes a made picture can take (docs/ai-images.md). */
enum ImageShape: string
{
    case Wide = 'wide';
    case Landscape = 'landscape';
    case Square = 'square';
    case Portrait = 'portrait';
    case Banner = 'banner';

    public function ratio(): string
    {
        return match ($this) {
            self::Wide => '16:9',
            self::Landscape => '4:3',
            self::Square => '1:1',
            self::Portrait => '3:4',
            self::Banner => '21:9',
        };
    }

    public function label(): string
    {
        return match ($this) {
            self::Wide => 'Wide 16:9',
            self::Landscape => 'Landscape 4:3',
            self::Square => 'Square',
            self::Portrait => 'Portrait 3:4',
            self::Banner => 'Banner 21:9',
        };
    }

    /** @return list<array{value: string, label: string, ratio: string}> */
    public static function options(): array
    {
        return array_map(fn (self $s) => ['value' => $s->value, 'label' => $s->label(), 'ratio' => $s->ratio()], self::cases());
    }
}
