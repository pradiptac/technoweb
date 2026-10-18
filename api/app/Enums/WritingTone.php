<?php

namespace App\Enums;

enum WritingTone: string
{
    case Default = 'default';
    case Formal = 'formal';
    case Friendly = 'friendly';
    case Plain = 'plain';

    public function label(): string
    {
        return match ($this) {
            self::Default => 'House style',
            self::Formal => 'Formal',
            self::Friendly => 'Friendly',
            self::Plain => 'Plain',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::Default => 'The house style alone.',
            self::Formal => 'Measured and professional.',
            self::Friendly => 'Warm and direct, still professional.',
            self::Plain => 'Short sentences and everyday words.',
        };
    }

    public function instruction(): string
    {
        return match ($this) {
            self::Default => '',
            self::Formal => 'Tone: formal and professional.',
            self::Friendly => 'Tone: warm, friendly and direct, still professional.',
            self::Plain => 'Tone: plain — short sentences, everyday words, no jargon.',
        };
    }

    /** @return list<array{value: string, label: string, blurb: string}> */
    public static function options(): array
    {
        return array_map(fn (self $t) => ['value' => $t->value, 'label' => $t->label(), 'blurb' => $t->blurb()], self::cases());
    }
}
