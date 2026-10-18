<?php

namespace App\Enums;

enum WritingMode: string
{
    case Write = 'write';
    case Rewrite = 'rewrite';
    case Shorten = 'shorten';
    case Expand = 'expand';
    case Grammar = 'grammar';
    case Tone = 'tone';

    public function label(): string
    {
        return match ($this) {
            self::Write => 'Write',
            self::Rewrite => 'Rewrite',
            self::Shorten => 'Shorten',
            self::Expand => 'Expand',
            self::Grammar => 'Fix grammar',
            self::Tone => 'Change tone',
        };
    }

    public function needsBrief(): bool
    {
        return $this === self::Write;
    }

    public function needsText(): bool
    {
        return $this !== self::Write;
    }

    /** What the model is asked to do, outside the fence. */
    public function instruction(): string
    {
        return match ($this) {
            self::Write => 'Write new copy from the brief. Use only facts the brief and context give.',
            self::Rewrite => 'Reword the content so it reads better. Keep its meaning, its facts and roughly its length.',
            self::Shorten => 'Make the content clearly shorter — about half — keeping what matters most.',
            self::Expand => 'Make the content fuller — about half again as long — by explaining, never by adding facts.',
            self::Grammar => 'Correct spelling, grammar and punctuation only. Change nothing else.',
            self::Tone => 'Keep the meaning and the facts; change only the tone, as asked.',
        };
    }

    /** @return list<array{value: string, label: string, needs_brief: bool}> */
    public static function options(): array
    {
        return array_map(fn (self $m) => ['value' => $m->value, 'label' => $m->label(), 'needs_brief' => $m->needsBrief()], self::cases());
    }
}
