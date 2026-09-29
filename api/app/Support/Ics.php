<?php

namespace App\Support;

use App\Support\Mail\MailBrand;
use Carbon\CarbonInterface;

/**
 * A calendar file for one appointment — RFC 5545, by hand. Engineer visits
 * and online meetings both send one (docs/visits.md, docs/meetings.md).
 *
 * Twenty lines of text are not worth a dependency. What makes one of these
 * work in Google Calendar, Outlook and Apple Calendar alike is short and
 * specific, and each is here on purpose:
 *
 * - **Times in UTC with a `Z`.** A `TZID` needs a `VTIMEZONE` block to be
 *   strictly valid, so UTC is both smaller and unambiguous; every client
 *   shows it in the reader's own zone.
 * - **A stable `UID` and an increasing `SEQUENCE`.** The caller's UID is the
 *   reference, so a moved appointment's file *updates* the event already in
 *   somebody's calendar rather than adding a second one beside it, and a
 *   cancellation (`STATUS:CANCELLED`, a higher sequence, the same UID)
 *   removes it.
 * - **CRLF line endings and lines folded at 75 octets**, which Outlook is
 *   strict about and the others forgive.
 * - **Text escaped**: backslash, semicolon, comma and newline. A company
 *   called "Smith, Jones & Co" would otherwise end the field at the comma.
 *
 * `METHOD:PUBLISH`, not `REQUEST`: this is a note of an appointment, not an
 * invitation with RSVP buttons nobody here reads the answers to — and for a
 * meeting Google sends the real invitation whenever it can.
 */
final class Ics
{
    /**
     * @param  string  $uid  stable across moves — the reference; the site's host is appended
     * @param  int  $seq  only ever grows; a cancellation must carry a higher one than the file it cancels
     */
    public static function event(
        string $uid,
        int $seq,
        CarbonInterface $start,
        CarbonInterface $end,
        string $summary,
        string $description,
        ?string $url = null,
        bool $cancelled = false,
        ?string $location = null,
        string $product = 'Calendar',
    ): string {
        $host = parse_url((string) config('app.frontend_url'), PHP_URL_HOST) ?: 'localhost';

        $lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//'.self::escape(MailBrand::name()).'//'.self::escape($product).'//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'BEGIN:VEVENT',
            'UID:'.$uid.'@'.$host,
            'DTSTAMP:'.self::utc(now()),
            'SEQUENCE:'.max(0, $seq),
            'DTSTART:'.self::utc($start),
            'DTEND:'.self::utc($end),
            'SUMMARY:'.self::escape($summary),
            'DESCRIPTION:'.self::escape($description),
            ...(filled($location) ? ['LOCATION:'.self::escape((string) $location)] : []),
            // URL is a URI value, not text: it is not escaped.
            ...(filled($url) ? ['URL:'.$url] : []),
            'STATUS:'.($cancelled ? 'CANCELLED' : 'CONFIRMED'),
            'END:VEVENT',
            'END:VCALENDAR',
        ];

        return implode("\r\n", array_map(self::fold(...), $lines))."\r\n";
    }

    /**
     * A sequence that only grows, from the moment the row last changed —
     * what both modules use, so no counter column is needed. A cancellation
     * adds one, so it outranks a file sent in the same second.
     */
    public static function sequence(?CarbonInterface $changedAt, bool $cancelled = false): int
    {
        return max(0, (int) ($changedAt?->getTimestamp() ?? 0) - 1_700_000_000) + ($cancelled ? 1 : 0);
    }

    public static function utc(CarbonInterface $at): string
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
