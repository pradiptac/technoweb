<?php

namespace App\Support\Meetings;

use App\Models\Meeting;
use App\Models\MeetingType;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

/**
 * How a meeting is written down — in a resource, an email, a WhatsApp
 * message — built once so they all say the same time the same way
 * (docs/meetings.md).
 *
 * Every time is converted to the app's timezone (`APP_TIMEZONE`) before it is
 * formatted and labelled with that zone, never a hard-coded "IST": the web
 * server may run in UTC, and `lib/dates.ts` has no timezone, so the API is
 * what writes `date_label` and `time_label` for every screen.
 */
final class MeetingText
{
    /** A moment on the app's wall clock. */
    public static function local(CarbonInterface $at): Carbon
    {
        return Carbon::instance($at)->setTimezone(MeetingSettings::timezone());
    }

    /** "Tue 6 Oct 2026". */
    public static function date(?CarbonInterface $at): string
    {
        return $at === null ? '' : self::local($at)->format('D j M Y');
    }

    /** "15:30 – 16:00", the meeting's own start and end. */
    public static function time(Meeting $meeting): string
    {
        return self::span($meeting->starts_at, $meeting->ends_at);
    }

    public static function span(?CarbonInterface $start, ?CarbonInterface $end): string
    {
        if ($start === null) {
            return '';
        }

        return self::local($start)->format('H:i').($end !== null ? ' – '.self::local($end)->format('H:i') : '');
    }

    /** "IST" for Asia/Kolkata. */
    public static function timezone(): string
    {
        return MeetingSettings::timezoneLabel();
    }

    /**
     * "in 1 hour", "in 24 hours", "in 3 days" — so one reminder wording reads
     * right whichever offset sent it.
     */
    public static function startsIn(Meeting $meeting, ?CarbonInterface $now = null): string
    {
        $now ??= now();
        $minutes = (int) ceil(($meeting->starts_at->getTimestamp() - $now->getTimestamp()) / 60);

        if ($minutes <= 0) {
            return 'now';
        }

        if ($minutes < 60) {
            return 'in '.$minutes.' '.($minutes === 1 ? 'minute' : 'minutes');
        }

        if ($minutes < 48 * 60) {
            $hours = (int) round($minutes / 60);

            return 'in '.$hours.' '.($hours === 1 ? 'hour' : 'hours');
        }

        $days = (int) round($minutes / 1440);

        return 'in '.$days.' days';
    }

    /** The first word of the name, for a greeting. */
    public static function firstName(Meeting $meeting): string
    {
        $name = trim((string) $meeting->name);

        return $name === '' ? 'there' : (string) strtok($name, ' ');
    }

    /** What kind of meeting it is: the type's name as it is now. */
    public static function typeName(Meeting $meeting): string
    {
        $meeting->loadMissing('meetingType');
        $type = $meeting->getRelation('meetingType');

        return $type instanceof MeetingType ? $type->name : 'Online meeting';
    }

    /** Who hosts it: the copied name, which survives the account. */
    public static function hostName(Meeting $meeting): string
    {
        return trim((string) $meeting->host_name) !== '' ? (string) $meeting->host_name : 'our team';
    }

    /**
     * How to join, as an HTML fragment the application built: the Meet link
     * when Google has made one, else a line saying it will follow. Every
     * part escaped.
     */
    public static function joinHtml(Meeting $meeting): string
    {
        if (filled($meeting->meet_url)) {
            $url = e((string) $meeting->meet_url);

            return '<p>Join on Google Meet: <a href="'.$url.'">'.$url.'</a></p>';
        }

        return '<p>We will send the link to join before the meeting.</p>';
    }
}
