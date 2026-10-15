<?php

namespace App\Support\Events;

use App\Models\Event;
use App\Models\EventRegistration;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

/**
 * How an event's date and place are written down — on the page, in an
 * email, in the calendar file — built once so they all say the same thing.
 *
 * **Every label on the wire is the API's** (the meetings' rule): the
 * frontends never format an event's date themselves. A date formatted in a
 * browser is in that browser's zone and locale, a date formatted by the Next
 * server is in the server's, and a seminar at three in Mumbai is at three
 * whoever is reading — so every time is taken to `APP_TIMEZONE` here before
 * it becomes words.
 */
final class EventText
{
    public static function timezone(): string
    {
        return (string) config('app.timezone', 'UTC');
    }

    /** The zone as people read it: "IST" for Asia/Kolkata, else the offset. */
    public static function timezoneLabel(): string
    {
        $now = Carbon::now(self::timezone());
        $abbr = $now->format('T');

        return preg_match('/^[A-Z]{2,5}$/', $abbr) ? $abbr : 'UTC'.$now->format('P');
    }

    public static function local(CarbonInterface $at): Carbon
    {
        return Carbon::instance($at)->setTimezone(self::timezone());
    }

    /** The instant, with the app zone's offset — what "ISO 8601 with the offset" means here. */
    public static function iso(?CarbonInterface $at): ?string
    {
        return $at === null ? null : self::local($at)->toIso8601String();
    }

    /** Wall-clock `Y-m-d\TH:i` in the app's zone — what a `datetime-local` input holds. */
    public static function wallClock(?CarbonInterface $at): ?string
    {
        return $at === null ? null : self::local($at)->format('Y-m-d\TH:i');
    }

    /**
     * "Thursday 12 November 2026" — or, for an event that runs over more
     * than one day, "12 – 14 November 2026" (and the months or years too
     * where they differ).
     */
    public static function dateLabel(Event $event): string
    {
        $start = self::local($event->starts_at);
        $end = $event->ends_at ? self::local($event->ends_at) : null;

        if ($end === null || $end->isSameDay($start)) {
            return $start->format('l j F Y');
        }

        if ($start->year !== $end->year) {
            return $start->format('j F Y').' – '.$end->format('j F Y');
        }

        return $start->month === $end->month
            ? $start->format('j').' – '.$end->format('j F Y')
            : $start->format('j F').' – '.$end->format('j F Y');
    }

    /** "3:00 pm – 4:30 pm IST", or "3:00 pm IST" for an event with no end. */
    public static function timeLabel(Event $event): string
    {
        $start = self::local($event->starts_at)->format('g:i a');
        $end = $event->ends_at ? self::local($event->ends_at)->format('g:i a') : null;

        return $start.($end !== null ? ' – '.$end : '').' '.self::timezoneLabel();
    }

    /** "Wednesday 11 November, 6:00 pm" — when registration closes. */
    public static function closesLabel(Event $event): ?string
    {
        return $event->registration_closes_at === null
            ? null
            : self::local($event->registration_closes_at)->format('l j F, g:i a');
    }

    /** One line for a subject or a message: the date, then the time. */
    public static function when(Event $event): string
    {
        return self::dateLabel($event).', '.self::timeLabel($event);
    }

    /** Where it is, on one line: the venue and its town, or "Online". */
    public static function place(Event $event): string
    {
        if (! $event->format->hasVenue()) {
            return 'Online';
        }

        return implode(', ', array_filter([trim((string) $event->venue_name), trim((string) $event->venue_city)])) ?: 'To be confirmed';
    }

    /** The venue with its address, for a calendar's LOCATION — line breaks flattened. */
    public static function location(Event $event): ?string
    {
        if (! $event->format->hasVenue()) {
            return 'Online';
        }

        $address = trim((string) preg_replace('/\s*\R\s*/', ', ', (string) $event->venue_address));
        $parts = array_filter([trim((string) $event->venue_name), $address !== '' ? $address : trim((string) $event->venue_city)]);

        return $parts === [] ? null : implode(', ', $parts);
    }

    /** The first word of the name, for a greeting. */
    public static function firstName(EventRegistration $registration): string
    {
        $name = trim((string) $registration->name);

        return $name === '' ? 'there' : (string) strtok($name, ' ');
    }

    /** "1 seat" / "3 seats". */
    public static function seats(int $seats): string
    {
        return $seats.' '.($seats === 1 ? 'seat' : 'seats');
    }
}
