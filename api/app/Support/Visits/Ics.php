<?php

namespace App\Support\Visits;

use App\Models\Setting;
use App\Models\VisitRequest;
use App\Support\Address;
use Carbon\CarbonInterface;

/**
 * A calendar file for a confirmed visit — RFC 5545, by hand.
 *
 * Twenty lines of text are not worth a dependency. What makes one of these
 * work in Google Calendar, Outlook and Apple Calendar alike is short and
 * specific, and each is here on purpose:
 *
 * - **Times in UTC with a `Z`.** A `TZID` needs a `VTIMEZONE` block to be
 *   strictly valid, and Asia/Kolkata has no DST to describe, so UTC is both
 *   smaller and unambiguous; every client shows it in the reader's own zone.
 * - **A stable `UID` and an increasing `SEQUENCE`.** The UID is the
 *   reference, so a rescheduled visit's file *updates* the event already in
 *   somebody's calendar rather than adding a second one beside it; the
 *   sequence is the time of the change, which only ever grows.
 * - **CRLF line endings and lines folded at 75 octets**, which Outlook is
 *   strict about and the others forgive.
 * - **Text escaped**: backslash, semicolon, comma and newline. A company
 *   called "Smith, Jones & Co" would otherwise end the field at the comma.
 *
 * `METHOD:PUBLISH`, not `REQUEST`: this is a note of an appointment, not an
 * invitation with RSVP buttons nobody here reads the answers to.
 */
final class Ics
{
    public static function forVisit(VisitRequest $visit): ?string
    {
        if ($visit->scheduled_start_at === null) {
            return null;
        }

        $start = $visit->scheduled_start_at;
        $end = $visit->scheduled_end_at ?? $start->copy()->addMinutes(VisitSettings::defaultMinutes());
        $company = (string) Setting::get('company_name', 'Technoware');
        $address = self::address($visit->site_address ?? []);
        $host = parse_url((string) config('app.frontend_url'), PHP_URL_HOST) ?: 'technoware.in';

        $lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//'.self::escape($company).'//Visits//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'BEGIN:VEVENT',
            'UID:'.$visit->reference.'@'.$host,
            'DTSTAMP:'.self::utc(now()),
            'SEQUENCE:'.max(0, (int) ($visit->updated_at?->getTimestamp() ?? 0) - 1_700_000_000),
            'DTSTART:'.self::utc($start),
            'DTEND:'.self::utc($end),
            'SUMMARY:'.self::escape($company.' engineer visit — '.$visit->topic()),
            'DESCRIPTION:'.self::escape('Reference '.$visit->reference.'. To cancel or ask for another time: '.$visit->manageUrl()),
            ...($address !== '' ? ['LOCATION:'.self::escape($address)] : []),
            'STATUS:CONFIRMED',
            'END:VEVENT',
            'END:VCALENDAR',
        ];

        return implode("\r\n", array_map(self::fold(...), $lines))."\r\n";
    }

    /** @param  array<string, string|null>  $address */
    private static function address(array $address): string
    {
        if (Address::isBlank($address)) {
            return '';
        }

        return implode(', ', array_filter(array_map(
            fn (string $f) => trim((string) ($address[$f] ?? '')),
            ['line1', 'line2', 'city', 'state', 'pin'],
        )));
    }

    private static function utc(CarbonInterface $at): string
    {
        return $at->copy()->utc()->format('Ymd\THis\Z');
    }

    public static function escape(string $text): string
    {
        return str_replace(['\\', ';', ',', "\r\n", "\n", "\r"], ['\\\\', '\;', '\,', '\n', '\n', ''], $text);
    }

    /** Folded at 75 octets, never inside a multibyte character. */
    public static function fold(string $line): string
    {
        if (strlen($line) <= 75) {
            return $line;
        }

        $out = [];
        $current = '';

        foreach (mb_str_split($line) as $char) {
            $limit = $out === [] ? 75 : 74; // continuation lines start with a space

            if (strlen($current) + strlen($char) > $limit) {
                $out[] = $current;
                $current = '';
            }

            $current .= $char;
        }

        $out[] = $current;

        return implode("\r\n ", $out);
    }
}
