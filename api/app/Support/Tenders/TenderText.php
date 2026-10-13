<?php

namespace App\Support\Tenders;

use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

/**
 * How a tender's dates and money are written down — on the page, in the
 * console, in a search result — built once so they all say the same thing.
 *
 * **Every label on the wire is the API's** (the events' and meetings' rule):
 * the frontends never format a tender's date themselves. A date formatted in
 * a browser is in that browser's zone and locale, a date formatted by the
 * Next server is in the server's, and the last date for submission is six in
 * the evening in Kolkata for whoever is reading it — so every time is taken
 * to `APP_TIMEZONE` here before it becomes words.
 *
 * That matters more here than anywhere else in the product: this is a
 * deadline. A tender shown closing a day late because a reader's laptop is
 * set to another zone is a bid somebody misses.
 */
final class TenderText
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

    /** "Monday 20 October 2026" — a date with no time, for the day it opens. */
    public static function dateLabel(?CarbonInterface $at): ?string
    {
        return $at === null ? null : self::local($at)->format('l j F Y');
    }

    /**
     * "Monday 3 November 2026, 6:00 pm IST" — a deadline, so the time and
     * the zone are part of it. Never a bare date: "closes on the 3rd" is the
     * question every bidder rings up to ask.
     */
    public static function deadlineLabel(?CarbonInterface $at): ?string
    {
        if ($at === null) {
            return null;
        }

        return self::local($at)->format('l j F Y, g:i a').' '.self::timezoneLabel();
    }

    /** "3 November 2026, 11:00 am IST" — shorter, for a pre-bid meeting or an opening. */
    public static function momentLabel(?CarbonInterface $at): ?string
    {
        if ($at === null) {
            return null;
        }

        return self::local($at)->format('j F Y, g:i a').' '.self::timezoneLabel();
    }

    /**
     * "₹2,500" — paise as rupees, grouped the Indian way.
     *
     * Null for a tender that names no fee, which is different from one whose
     * fee is nothing: a free tender document is `0` and reads "Free".
     */
    public static function money(?int $paise): ?string
    {
        if ($paise === null) {
            return null;
        }

        if ($paise === 0) {
            return 'Free';
        }

        $rupees = intdiv($paise, 100);
        $pence = $paise % 100;

        $whole = self::groupIndian($rupees);

        return '₹'.$whole.($pence === 0 ? '' : '.'.str_pad((string) $pence, 2, '0', STR_PAD_LEFT));
    }

    /**
     * 1234567 → "12,34,567".
     *
     * `number_format` groups in threes, which is not how a rupee figure is
     * written: the last three digits, then twos. A lakh shown as "100,000"
     * reads as wrong to the people this is for.
     */
    private static function groupIndian(int $rupees): string
    {
        $digits = (string) abs($rupees);
        $sign = $rupees < 0 ? '-' : '';

        if (strlen($digits) <= 3) {
            return $sign.$digits;
        }

        $last = substr($digits, -3);
        $rest = substr($digits, 0, -3);
        $groups = [];

        while (strlen($rest) > 2) {
            $groups[] = substr($rest, -2);
            $rest = substr($rest, 0, -2);
        }

        if ($rest !== '') {
            $groups[] = $rest;
        }

        return $sign.implode(',', array_reverse($groups)).','.$last;
    }
}
