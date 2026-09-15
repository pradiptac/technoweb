<?php

namespace App\Support;

use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

/**
 * Whether the announcement bar is live right now — the switch, the window
 * and a message, together.
 *
 * Decided here, on the server, and published as one bit
 * (`announcement_live`) rather than left to the browser: the site is cached
 * and served to visitors whose clocks are whatever they are, and a strip that
 * one visitor sees and another does not is a support ticket. The window is
 * two `datetime-local` strings (`Y-m-d\TH:i`, what the console posts) read
 * in the application's timezone; a stored value that will not parse counts
 * as blank, because the switch is the gate an editor reaches for and a
 * mistyped date must not silently keep a bar on or off.
 */
class Announcement
{
    public const FORMAT = 'Y-m-d\\TH:i';

    /**
     * @param  array<string, string|null>  $values  The public settings map.
     */
    public static function isLive(array $values, ?CarbonInterface $now = null): bool
    {
        $now ??= Carbon::now();

        if (($values['announcement_enabled'] ?? '0') !== '1') {
            return false;
        }

        if (blank(trim(strip_tags((string) ($values['announcement_message'] ?? ''))))) {
            return false;
        }

        $starts = self::parse($values['announcement_starts_at'] ?? null);
        $ends = self::parse($values['announcement_ends_at'] ?? null);

        if ($starts !== null && $starts->greaterThan($now)) {
            return false;
        }

        if ($ends !== null && $ends->lessThan($now)) {
            return false;
        }

        return true;
    }

    /** A `datetime-local` value as a Carbon in the app timezone, or null. */
    public static function parse(?string $value): ?Carbon
    {
        if (blank($value)) {
            return null;
        }

        try {
            $parsed = Carbon::createFromFormat(self::FORMAT, (string) $value, config('app.timezone'));
        } catch (\Throwable) {
            return null;
        }

        return $parsed ?: null;
    }
}
