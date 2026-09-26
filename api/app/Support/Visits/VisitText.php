<?php

namespace App\Support\Visits;

use App\Enums\MessageEvent;
use App\Models\VisitRequest;
use App\Support\Address;
use App\Support\Messaging\MessageRecipient;
use App\Support\Messaging\Messenger;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

/**
 * How a visit is written down — in an email, a WhatsApp message, the .ics —
 * built once so the three say the same date the same way.
 *
 * Dates are the app's timezone (IST), written the way this audience writes
 * them: "Tue 6 Oct 2026", "10:30 – 12:00". Never `toLocaleString()`, which
 * formats in whatever locale the process happens to have.
 */
final class VisitText
{
    public static function date(?CarbonInterface $at): string
    {
        return $at?->format('D j M Y') ?? '';
    }

    public static function time(VisitRequest $visit): string
    {
        if ($visit->scheduled_start_at === null) {
            return '';
        }

        $end = $visit->scheduled_end_at;

        return $visit->scheduled_start_at->format('H:i').($end ? ' – '.$end->format('H:i') : '');
    }

    /**
     * The times asked for, in the order they were ranked.
     *
     * @return list<string>
     */
    public static function preferredLines(VisitRequest $visit): array
    {
        $lines = [];

        foreach ($visit->preferred ?? [] as $slot) {
            $date = Carbon::hasFormat((string) ($slot['date'] ?? ''), 'Y-m-d')
                ? Carbon::createFromFormat('Y-m-d', $slot['date'])->format('D j M')
                : (string) ($slot['date'] ?? '');
            $window = VisitSettings::window((string) ($slot['window'] ?? ''));

            $lines[] = $date.' — '.($window
                ? $window['label'].' ('.$window['start'].'–'.$window['end'].')'
                : VisitSettings::windowLabel((string) ($slot['window'] ?? '')));
        }

        return $lines;
    }

    /**
     * The same list for a resource: the stored pair plus the words it reads
     * as today, so a screen never has to know the window list.
     *
     * @return list<array{date: string, window: string, label: string}>
     */
    public static function preferredRows(VisitRequest $visit): array
    {
        $lines = self::preferredLines($visit);
        $rows = [];

        foreach (array_values($visit->preferred ?? []) as $i => $slot) {
            $rows[] = [
                'date' => (string) ($slot['date'] ?? ''),
                'window' => (string) ($slot['window'] ?? ''),
                'label' => $lines[$i] ?? '',
            ];
        }

        return $rows;
    }

    /** The same list as an HTML fragment the application built — every part escaped. */
    public static function preferredHtml(VisitRequest $visit): string
    {
        $items = array_map(fn (string $line) => '<li>'.e($line).'</li>', self::preferredLines($visit));

        return $items === [] ? '' : '<ul>'.implode('', $items).'</ul>';
    }

    public static function address(VisitRequest $visit): string
    {
        $address = $visit->site_address ?? [];

        if (Address::isBlank($address)) {
            return '';
        }

        return implode(', ', array_filter(array_map(
            fn (string $f) => trim((string) ($address[$f] ?? '')),
            ['line1', 'line2', 'city', 'state', 'pin'],
        )));
    }

    /** The first word of the name, for a greeting. */
    public static function firstName(VisitRequest $visit): string
    {
        $name = trim((string) $visit->name);

        return $name === '' ? 'there' : (string) strtok($name, ' ');
    }

    /**
     * Tell them on WhatsApp, RCS or push as well, when an automation says so
     * and they opted in. `Messenger` never fails the request that calls it.
     */
    public static function notify(MessageEvent $event, VisitRequest $visit): void
    {
        Messenger::notify($event, new MessageRecipient($visit->customer_id, $visit->phone, $visit->name), [
            'reference' => $visit->reference,
            'service_name' => $visit->topic(),
            'visit_date' => self::date($visit->scheduled_start_at),
            'visit_time' => self::time($visit),
            // The portal for an account holder; the token link for a guest.
            'visit_url' => $visit->customer_id ? $visit->portalUrl() : $visit->manageUrl(),
        ]);
    }
}
