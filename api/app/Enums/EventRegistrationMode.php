<?php

namespace App\Enums;

/**
 * Whether, and where, people register for an event.
 *
 * Three answers rather than a switch, because "no registration" and
 * "registration is somebody else's" are different pages: the first is an
 * announcement, the second is a button to another site, and neither has a
 * capacity, a waiting list or a closing date of ours.
 */
enum EventRegistrationMode: string
{
    case None = 'none';
    case Open = 'open';
    case External = 'external';

    public function label(): string
    {
        return match ($this) {
            self::None => 'No registration',
            self::Open => 'Register on this site',
            self::External => 'Register somewhere else',
        };
    }

    /** A sentence for the console's radio, saying what the page will do. */
    public function blurb(): string
    {
        return match ($this) {
            self::None => 'An announcement. The page gives the date and the place and nobody signs up.',
            self::Open => 'People register here, free. You may set a capacity, a waiting list and a closing date.',
            self::External => 'A button to somebody else\'s sign-up page — the organiser\'s, or a ticketing site.',
        };
    }

    /** @return array<int, array{value: string, label: string, blurb: string}> */
    public static function options(): array
    {
        return array_map(fn (self $c) => [
            'value' => $c->value,
            'label' => $c->label(),
            'blurb' => $c->blurb(),
        ], self::cases());
    }
}
