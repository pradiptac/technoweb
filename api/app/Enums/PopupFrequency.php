<?php

namespace App\Enums;

/**
 * How often one visitor sees the same popup.
 *
 * The default is `Session`, and that default is the whole difference between a
 * promotion and the pattern people install blockers for. `EveryVisit` is here
 * because it was asked for and is occasionally right — a stock notice on a
 * shopfront — but its own blurb says what it does, because "it will appear
 * again when they press back" is not something anybody expects until it
 * happens to them.
 *
 * The counting is done in the browser: this enum only says which store to use
 * and for how long. See `site-popup.tsx`.
 */
enum PopupFrequency: string
{
    case Session = 'session';
    case Day = 'day';
    case EveryVisit = 'every';

    public function label(): string
    {
        return match ($this) {
            self::Session => 'Once per visit',
            self::Day => 'Once a day',
            self::EveryVisit => 'Every page load',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::Session => 'Shows once, then stays away until they close the browser.',
            self::Day => 'Shows once, then not again for 24 hours, even if they come back tomorrow morning.',
            self::EveryVisit => 'Shows on every single page they open, including when they press back. Use sparingly.',
        };
    }

    /**
     * @return array<int, array{value: string, label: string, blurb: string}>
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
