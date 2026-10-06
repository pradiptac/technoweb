<?php

namespace App\Support\Events;

use App\Models\Setting;

/**
 * What the `events` settings group says, read in one place — the
 * `VisitSettings` shape.
 *
 * Three rows, all private: where the desk's notice goes, how long before an
 * event the reminder is sent, and how many seats one registration may ask
 * for by default. Each reader falls back per field, so an install that
 * never ran the seeder behaves as the seeder would have left it.
 */
final class EventSettings
{
    public const DEFAULT_REMINDER_HOURS = 24;

    public const MAX_REMINDER_HOURS = 168;

    public const DEFAULT_MAX_SEATS = 5;

    /** The most one registration may hold, whatever an event says. */
    public const SEATS_CEILING = 20;

    /**
     * Hours before the start that confirmed registrants are reminded.
     * **Zero sends no reminder** — it is an answer, not a missing value.
     */
    public static function reminderHours(): int
    {
        return self::bounded('event_reminder_hours', self::DEFAULT_REMINDER_HOURS, 0, self::MAX_REMINDER_HOURS);
    }

    /** The default for a new event's `max_seats`. */
    public static function maxSeats(): int
    {
        return self::bounded('event_max_seats', self::DEFAULT_MAX_SEATS, 1, self::SEATS_CEILING);
    }

    /**
     * Why a value for one of this group's keys would be refused, or null.
     * Blank is always accepted — it reads as the default.
     */
    public static function refusalFor(string $key, mixed $value): ?string
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        $value = trim($value);

        return match ($key) {
            'event_reminder_hours' => ctype_digit($value) && (int) $value <= self::MAX_REMINDER_HOURS
                ? null
                : 'A whole number of hours, 0 to '.self::MAX_REMINDER_HOURS.'. 0 sends no reminder.',
            'event_max_seats' => ctype_digit($value) && (int) $value >= 1 && (int) $value <= self::SEATS_CEILING
                ? null
                : 'A whole number of seats, 1 to '.self::SEATS_CEILING.'.',
            'events_email' => filter_var($value, FILTER_VALIDATE_EMAIL) ? null : 'An email address, or blank for the sales inbox.',
            default => null,
        };
    }

    private static function bounded(string $key, int $default, int $min, int $max): int
    {
        $value = Setting::get($key);

        if (! is_numeric($value)) {
            return $default;
        }

        $value = (int) $value;

        return $value < $min || $value > $max ? $default : $value;
    }
}
