<?php

namespace App\Enums;

/** How a made picture should look (docs/ai-images.md). */
enum ImageStyle: string
{
    case Photo = 'photo';
    case Illustration = 'illustration';
    case Render = 'render';
    case Flat = 'flat';

    public function label(): string
    {
        return match ($this) {
            self::Photo => 'Photo',
            self::Illustration => 'Illustration',
            self::Render => '3D render',
            self::Flat => 'Flat graphic',
        };
    }

    public function instruction(): string
    {
        return match ($this) {
            self::Photo => 'A realistic photograph, natural light, sharp focus.',
            self::Illustration => 'A clean editorial illustration.',
            self::Render => 'A polished 3D render with soft studio lighting.',
            self::Flat => 'A flat vector-style graphic with simple shapes and few colours.',
        };
    }

    /** @return list<array{value: string, label: string}> */
    public static function options(): array
    {
        return array_map(fn (self $s) => ['value' => $s->value, 'label' => $s->label()], self::cases());
    }
}
