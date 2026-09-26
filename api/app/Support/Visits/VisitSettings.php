<?php

namespace App\Support\Visits;

use App\Models\Setting;
use Illuminate\Support\Carbon;

/**
 * What the `visits` settings group says, read in one place.
 *
 * The request form, the validation and `GET /visits/options` all ask the same
 * questions — which days, which parts of the day, how far ahead — and three
 * answers to one question is the drift this codebase keeps paying for. So
 * the parsing lives here and nothing else reads the raw rows.
 *
 * Every reader falls back per field: a window line that does not parse is
 * skipped, a nonsense notice reads as the default, and an install that never
 * ran the seeder gets the defaults the seeder would have written. A booking
 * form that breaks because somebody typed "9am" into a setting is worse than
 * one that quietly offers the defaults.
 */
final class VisitSettings
{
    /**
     * The keys the public `/settings` map carries, named rather than grouped —
     * the `ChatSettings::PUBLIC_KEYS` rule. `visits_email` and
     * `visit_default_minutes` are the desk's and stay private.
     */
    public const PUBLIC_KEYS = [
        'visits_enabled', 'visit_windows', 'visit_days', 'visit_min_notice_days', 'visit_max_days', 'visit_holidays',
    ];

    /** What the seeder writes, and what an unparseable value reads as. */
    public const DEFAULT_WINDOWS = "morning|Morning|09:00|12:00\nafternoon|Afternoon|12:00|15:00\nevening|Evening|15:00|18:00";

    public const DEFAULT_DAYS = 'mon,tue,wed,thu,fri,sat';

    private const DAY_NUMBERS = ['mon' => 1, 'tue' => 2, 'wed' => 3, 'thu' => 4, 'fri' => 5, 'sat' => 6, 'sun' => 7];

    private const DAY_NAMES = [1 => 'Monday', 2 => 'Tuesday', 3 => 'Wednesday', 4 => 'Thursday', 5 => 'Friday', 6 => 'Saturday', 7 => 'Sunday'];

    /** At most this many preferred times per request. */
    public const MAX_PREFERRED = 3;

    public static function enabled(): bool
    {
        $value = Setting::get('visits_enabled', true);

        return $value === true || $value === '1' || $value === 1;
    }

    /**
     * The parts of the day on offer, in the order written.
     *
     * @return list<array{key: string, label: string, start: string, end: string}>
     */
    public static function windows(): array
    {
        $parsed = self::parseWindows((string) Setting::get('visit_windows', ''));

        return $parsed !== [] ? $parsed : self::parseWindows(self::DEFAULT_WINDOWS);
    }

    /**
     * `key|Label|09:00|12:00`, one per line. A key is lower-case letters,
     * digits and underscores, because it is stored on every request and a
     * label is not: renaming "Morning" to "Before lunch" must not orphan the
     * requests already made for it.
     *
     * @return list<array{key: string, label: string, start: string, end: string}>
     */
    public static function parseWindows(string $raw): array
    {
        $windows = [];

        foreach (preg_split('/\R/', $raw) ?: [] as $line) {
            $parts = array_map('trim', explode('|', $line));

            if (count($parts) !== 4) {
                continue;
            }

            [$key, $label, $start, $end] = $parts;

            if (! preg_match('/^[a-z][a-z0-9_]{0,23}$/', $key) || $label === ''
                || ! preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $start)
                || ! preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $end)
                || $end <= $start
                || isset($windows[$key])) {
                continue;
            }

            $windows[$key] = ['key' => $key, 'label' => mb_substr($label, 0, 40), 'start' => $start, 'end' => $end];
        }

        return array_values($windows);
    }

    /** @return array{key: string, label: string, start: string, end: string}|null */
    public static function window(string $key): ?array
    {
        foreach (self::windows() as $window) {
            if ($window['key'] === $key) {
                return $window;
            }
        }

        return null;
    }

    /** The label a stored window key reads as today, or the key itself if it was since removed. */
    public static function windowLabel(string $key): string
    {
        return self::window($key)['label'] ?? ucfirst(str_replace('_', ' ', $key));
    }

    /**
     * ISO weekdays offered (1 = Monday). `mon,tue,…` in the setting.
     *
     * @return list<int>
     */
    public static function days(): array
    {
        $days = self::parseDays((string) Setting::get('visit_days', ''));

        return $days !== [] ? $days : self::parseDays(self::DEFAULT_DAYS);
    }

    /** @return list<int> */
    public static function parseDays(string $raw): array
    {
        $days = [];

        foreach (preg_split('/[\s,]+/', strtolower($raw)) ?: [] as $token) {
            $key = substr($token, 0, 3);

            if (isset(self::DAY_NUMBERS[$key])) {
                $days[self::DAY_NUMBERS[$key]] = self::DAY_NUMBERS[$key];
            }
        }

        ksort($days);

        return array_values($days);
    }

    public static function minNoticeDays(): int
    {
        return self::bounded('visit_min_notice_days', 1, 0, 60);
    }

    public static function maxDays(): int
    {
        return max(self::minNoticeDays(), self::bounded('visit_max_days', 30, 1, 365));
    }

    public static function defaultMinutes(): int
    {
        return self::bounded('visit_default_minutes', 90, 15, 720);
    }

    /**
     * Dates nobody is sent, `Y-m-d` one per line. Anything after the date on
     * a line is ignored, so "2026-10-20 Diwali" is a holiday with a note.
     *
     * @return list<string>
     */
    public static function holidays(): array
    {
        $dates = [];

        foreach (preg_split('/\R/', (string) Setting::get('visit_holidays', '')) ?: [] as $line) {
            if (preg_match('/^\s*(\d{4}-\d{2}-\d{2})\b/', $line, $m) && Carbon::hasFormat($m[1], 'Y-m-d')) {
                $dates[$m[1]] = $m[1];
            }
        }

        ksort($dates);

        return array_values($dates);
    }

    /** The first date a request may name, in the app's timezone (IST). */
    public static function earliest(): Carbon
    {
        return Carbon::today()->addDays(self::minNoticeDays());
    }

    public static function latest(): Carbon
    {
        return Carbon::today()->addDays(self::maxDays());
    }

    /**
     * Why this date cannot be asked for, as a sentence, or null when it can.
     * The four rules the form's date input can only half enforce: `min` and
     * `max` stop the obvious, and a Sunday or a holiday gets through any
     * date picker.
     */
    public static function refusal(string $date): ?string
    {
        if (! Carbon::hasFormat($date, 'Y-m-d')) {
            return 'Choose a date.';
        }

        $day = Carbon::createFromFormat('Y-m-d', $date)->startOfDay();

        if ($day->lt(self::earliest())) {
            $notice = self::minNoticeDays();

            return $notice === 0
                ? 'That date has passed.'
                : 'We need at least '.$notice.' '.($notice === 1 ? 'day' : 'days').' of notice — choose '.self::earliest()->format('j M').' or later.';
        }

        if ($day->gt(self::latest())) {
            return 'We book up to '.self::maxDays().' days ahead — choose '.self::latest()->format('j M').' or earlier.';
        }

        if (! in_array($day->dayOfWeekIso, self::days(), true)) {
            return 'Engineers do not visit on a '.self::DAY_NAMES[$day->dayOfWeekIso].'.';
        }

        if (in_array($date, self::holidays(), true)) {
            return 'We are closed on '.$day->format('j M').'.';
        }

        return null;
    }

    /**
     * Everything the request form needs, and nothing the desk keeps.
     *
     * @return array<string, mixed>
     */
    public static function publicOptions(): array
    {
        return [
            'enabled' => self::enabled(),
            'windows' => array_map(fn (array $w) => [
                'value' => $w['key'], 'label' => $w['label'], 'start' => $w['start'], 'end' => $w['end'],
            ], self::windows()),
            'days' => self::days(),
            'min_date' => self::earliest()->toDateString(),
            'max_date' => self::latest()->toDateString(),
            'holidays' => array_values(array_filter(
                self::holidays(),
                fn (string $d) => $d >= self::earliest()->toDateString() && $d <= self::latest()->toDateString(),
            )),
            'max_preferred' => self::MAX_PREFERRED,
        ];
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

        return match ($key) {
            'visit_windows' => self::parseWindows($value) === []
                ? 'One part of the day per line, as key|Label|09:00|12:00 — for example morning|Morning|09:00|12:00.'
                : null,
            'visit_days' => self::parseDays($value) === []
                ? 'The days engineers visit, as mon,tue,wed,thu,fri,sat.'
                : null,
            'visit_min_notice_days' => ctype_digit(trim($value)) && (int) $value <= 60 ? null : 'A whole number of days, 0 to 60.',
            'visit_max_days' => ctype_digit(trim($value)) && (int) $value >= 1 && (int) $value <= 365 ? null : 'A whole number of days, 1 to 365.',
            'visit_default_minutes' => ctype_digit(trim($value)) && (int) $value >= 15 && (int) $value <= 720 ? null : 'A whole number of minutes, 15 to 720.',
            'visits_email' => filter_var(trim($value), FILTER_VALIDATE_EMAIL) ? null : 'An email address, or blank for the sales inbox.',
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
