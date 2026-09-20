<?php

namespace App\Enums;

/**
 * What opens a popup.
 *
 * `Delay` is what every popup did before this existed: a timer from the
 * page settling, `delay_ms` long. `Exit` is exit intent — the pointer
 * leaving the page through the top edge, which is where the tab bar and the
 * address bar are — asked for on 2026-09-15. A touch screen has no pointer
 * to leave with, so on a device that cannot hover an `Exit` popup falls
 * back to the delay rather than never showing; the blurb says so, because
 * "it never appeared on my phone" is otherwise a bug report.
 *
 * The listening is done in the browser: this enum only names the options.
 * See `site-popup.tsx`.
 */
enum PopupTrigger: string
{
    case Delay = 'delay';
    case Exit = 'exit';

    public function label(): string
    {
        return match ($this) {
            self::Delay => 'After a delay',
            self::Exit => 'When the pointer leaves the page',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::Delay => 'Opens once the wait below has passed.',
            self::Exit => 'Exit intent: opens when the mouse moves up out of the page, towards the tabs and the address bar. Phones have no pointer, so there it opens after the wait below instead.',
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
