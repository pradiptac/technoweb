<?php

namespace App\Support\Meetings;

use App\Models\Setting;
use Illuminate\Support\Carbon;

/**
 * What the `meetings` settings group says, read in one place (2026-09-29,
 * docs/meetings.md) — the `VisitSettings` shape.
 *
 * The slot engine, the booking rules, the reminders and `GET
 * meetings/options` all ask the same questions, and three parsers is three
 * answers. Every reader falls back per field: an hours line that does not
 * parse is skipped, a nonsense number reads as the default, and an install
 * that never ran the seeder gets what the seeder would have written. The
 * console refuses a value that would parse to nothing (`refusalFor`, called
 * from `SettingController`) rather than saving it and quietly reading the
 * default.
 *
 * The Google connection's own rows are the `meetings_google` group and are
 * not read here.
 */
final class MeetingSettings
{
    /**
     * The keys the public `/settings` map carries, named rather than grouped —
     * the `VisitSettings::PUBLIC_KEYS` rule. The desk's address, the limits
     * and the reminder offsets stay private.
     */
    public const PUBLIC_KEYS = [
        'meetings_enabled', 'meeting_slot_step', 'meeting_min_notice_hours', 'meeting_max_days',
    ];

    /** What the seeder writes, and what an unparseable value reads as. */
    public const DEFAULT_HOURS = 'mon-fri|10:00|18:00';

    public const DEFAULT_REMINDERS = '1440,60';

    public const STEPS = [15, 30, 60];

    /** Choices the console draws as a select; anything else is refused. */
    public const OPTIONS = [
        'meetings_enabled' => [
            ['value' => '0', 'label' => 'Off', 'description' => 'The booking page says to get in touch instead; the desk can still schedule meetings from the console.'],
            ['value' => '1', 'label' => 'On', 'description' => 'Customers book online meetings on the site and in the portal, into the hosts\' free time.'],
        ],
        'meeting_slot_step' => [
            ['value' => '15', 'label' => 'Every 15 minutes', 'description' => 'Meetings may start at :00, :15, :30 and :45.'],
            ['value' => '30', 'label' => 'Every 30 minutes', 'description' => 'Meetings may start on the hour and the half hour.'],
            ['value' => '60', 'label' => 'On the hour', 'description' => 'Meetings start on the hour only.'],
        ],
        'meeting_block_google_busy' => [
            ['value' => '1', 'label' => 'Yes', 'description' => 'A time a host is busy in Google Calendar is not offered. A calendar Google will not show us is treated as free.'],
            ['value' => '0', 'label' => 'No', 'description' => 'Only meetings booked here, working hours and time off decide what is free.'],
        ],
    ];

    private const DAY_NUMBERS = ['mon' => 1, 'tue' => 2, 'wed' => 3, 'thu' => 4, 'fri' => 5, 'sat' => 6, 'sun' => 7];

    public static function enabled(): bool
    {
        $value = Setting::get('meetings_enabled', false);

        return $value === true || $value === '1' || $value === 1;
    }

    /**
     * The default working hours, by ISO weekday (1 is Monday), each day a
     * list of `[start, end]` on the wall clock. A host with hours of their own
     * does not read this.
     *
     * @return array<int, list<array{0: string, 1: string}>>
     */
    public static function defaultHours(): array
    {
        $parsed = self::parseHours((string) Setting::get('meeting_default_hours', ''));

        return $parsed !== [] ? $parsed : self::parseHours(self::DEFAULT_HOURS);
    }

    /**
     * `days|start|end`, one per line: `mon-fri|10:00|18:00`, `sat|10:00|13:00`,
     * `mon,wed|14:00|17:00`. A day may appear on several lines — a split day.
     *
     * @return array<int, list<array{0: string, 1: string}>>
     */
    public static function parseHours(string $raw): array
    {
        $hours = [];

        foreach (preg_split('/\R/', $raw) ?: [] as $line) {
            $parts = array_map('trim', explode('|', $line));

            if (count($parts) !== 3) {
                continue;
            }

            [$days, $start, $end] = $parts;

            if (! self::isTime($start) || ! self::isTime($end) || $end <= $start) {
                continue;
            }

            foreach (self::parseDays($days) as $day) {
                $hours[$day][] = [$start, $end];
            }
        }

        ksort($hours);

        foreach ($hours as $day => $spans) {
            usort($spans, fn (array $a, array $b) => strcmp($a[0], $b[0]));
            $hours[$day] = $spans;
        }

        return $hours;
    }

    /**
     * `mon-fri`, `mon,wed,fri`, `sat` — ISO weekdays, in order.
     *
     * @return list<int>
     */
    public static function parseDays(string $raw): array
    {
        $days = [];

        foreach (preg_split('/\s*,\s*/', strtolower(trim($raw))) ?: [] as $token) {
            if (preg_match('/^([a-z]{3})[a-z]*\s*-\s*([a-z]{3})[a-z]*$/', $token, $m)
                && isset(self::DAY_NUMBERS[$m[1]], self::DAY_NUMBERS[$m[2]])) {
                $from = self::DAY_NUMBERS[$m[1]];
                $to = self::DAY_NUMBERS[$m[2]];

                // `sat-mon` wraps round the weekend.
                for ($d = $from, $n = 0; $n < 7; $d = $d % 7 + 1, $n++) {
                    $days[$d] = $d;

                    if ($d === $to) {
                        break;
                    }
                }

                continue;
            }

            $key = substr($token, 0, 3);

            if (isset(self::DAY_NUMBERS[$key])) {
                $days[self::DAY_NUMBERS[$key]] = self::DAY_NUMBERS[$key];
            }
        }

        ksort($days);

        return array_values($days);
    }

    public static function slotStep(): int
    {
        $value = (int) Setting::get('meeting_slot_step', 30);

        return in_array($value, self::STEPS, true) ? $value : 30;
    }

    public static function minNoticeHours(): int
    {
        return self::bounded('meeting_min_notice_hours', 4, 0, 336);
    }

    public static function maxDays(): int
    {
        return self::bounded('meeting_max_days', 30, 1, 365);
    }

    /**
     * Closed dates, `Y-m-d` one per line; anything after the date is a note.
     *
     * @return list<string>
     */
    public static function holidays(): array
    {
        $dates = [];

        foreach (preg_split('/\R/', (string) Setting::get('meeting_holidays', '')) ?: [] as $line) {
            if (preg_match('/^\s*(\d{4}-\d{2}-\d{2})\b/', $line, $m) && Carbon::hasFormat($m[1], 'Y-m-d')) {
                $dates[$m[1]] = $m[1];
            }
        }

        ksort($dates);

        return array_values($dates);
    }

    /**
     * When the reminders go, in minutes before the start, largest first.
     *
     * @return list<int>
     */
    public static function reminderOffsets(): array
    {
        $parsed = self::parseReminders((string) Setting::get('meeting_reminders', ''));

        return $parsed !== [] ? $parsed : self::parseReminders(self::DEFAULT_REMINDERS);
    }

    /** @return list<int> */
    public static function parseReminders(string $raw): array
    {
        $offsets = [];

        foreach (preg_split('/[\s,]+/', trim($raw)) ?: [] as $token) {
            if (ctype_digit($token) && (int) $token >= 5 && (int) $token <= 10080) {
                $offsets[(int) $token] = (int) $token;
            }
        }

        krsort($offsets);

        return array_values($offsets);
    }

    /** The desk's address for new bookings and changes; null means the sales inbox. */
    public static function email(): ?string
    {
        $value = trim((string) Setting::get('meetings_email', ''));

        return filter_var($value, FILTER_VALIDATE_EMAIL) ? $value : null;
    }

    public static function blockGoogleBusy(): bool
    {
        $value = Setting::get('meeting_block_google_busy', true);

        return $value === true || $value === '1' || $value === 1;
    }

    /** Inside this many hours of the start a customer can no longer cancel or move; staff can. */
    public static function changeCutoffHours(): int
    {
        return self::bounded('meeting_change_cutoff_hours', 12, 0, 168);
    }

    /** Future meetings one email address or phone number may hold at once. */
    public static function maxOpenPerContact(): int
    {
        return self::bounded('meeting_max_open_per_contact', 2, 1, 20);
    }

    /** How many times a customer may move one meeting themselves. */
    public static function maxReschedules(): int
    {
        return self::bounded('meeting_max_reschedules', 3, 0, 20);
    }

    /** Bookings one IP address may make in a day. */
    public static function dailyIpCap(): int
    {
        return self::bounded('meeting_daily_ip_cap', 10, 1, 500);
    }

    /** The zone every time is computed and written in — the app's, never a hard-coded "IST". */
    public static function timezone(): string
    {
        return (string) config('app.timezone', 'UTC');
    }

    /** The zone as people read it: "IST" for Asia/Kolkata, else the offset. */
    public static function timezoneLabel(): string
    {
        $abbr = Carbon::now(self::timezone())->format('T');

        return preg_match('/^[A-Z]{2,5}$/', $abbr) ? $abbr : 'UTC'.Carbon::now(self::timezone())->format('P');
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

        if (isset(self::OPTIONS[$key])) {
            return in_array($value, array_column(self::OPTIONS[$key], 'value'), true) ? null : 'Choose one of the options from the list.';
        }

        $int = fn (int $min, int $max, string $unit) => ctype_digit($value) && (int) $value >= $min && (int) $value <= $max
            ? null
            : "A whole number of {$unit}, {$min} to {$max}.";

        return match ($key) {
            'meeting_default_hours' => self::parseHours($value) === []
                ? 'One stretch per line, as days|start|end on the 24-hour clock — for example mon-fri|10:00|18:00.'
                : null,
            'meeting_holidays' => null,
            'meeting_reminders' => self::parseReminders($value) === []
                ? 'Minutes before the meeting, comma-separated, each 5 to 10080 — for example 1440,60 for a day and an hour before.'
                : null,
            'meeting_min_notice_hours' => $int(0, 336, 'hours'),
            'meeting_max_days' => $int(1, 365, 'days'),
            'meeting_change_cutoff_hours' => $int(0, 168, 'hours'),
            'meeting_max_open_per_contact' => $int(1, 20, 'meetings'),
            'meeting_max_reschedules' => $int(0, 20, 'moves'),
            'meeting_daily_ip_cap' => $int(1, 500, 'bookings'),
            'meetings_email' => filter_var($value, FILTER_VALIDATE_EMAIL) ? null : 'An email address, or blank for the sales inbox.',
            default => null,
        };
    }

    private static function isTime(string $value): bool
    {
        return preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $value) === 1;
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
