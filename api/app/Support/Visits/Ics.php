<?php

namespace App\Support\Visits;

use App\Models\VisitRequest;
use App\Support\Address;
use App\Support\Ics as CalendarFile;
use App\Support\Mail\MailBrand;

/**
 * A calendar file for a confirmed visit. The file itself — UTC times, a
 * stable UID, a growing SEQUENCE, CRLF and folding, escaping — is
 * `App\Support\Ics`, which online meetings use too; this decides what a
 * visit's file says.
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
        $address = self::address($visit->site_address ?? []);

        return CalendarFile::event(
            uid: $visit->reference,
            seq: CalendarFile::sequence($visit->updated_at),
            start: $start,
            end: $end,
            summary: MailBrand::name().' engineer visit — '.$visit->topic(),
            description: 'Reference '.$visit->reference.'. To cancel or ask for another time: '.$visit->manageUrl(),
            location: $address !== '' ? $address : null,
            product: 'Visits',
        );
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

    public static function escape(string $text): string
    {
        return CalendarFile::escape($text);
    }

    public static function fold(string $line): string
    {
        return CalendarFile::fold($line);
    }
}
