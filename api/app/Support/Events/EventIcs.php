<?php

namespace App\Support\Events;

use App\Models\Event;
use App\Models\EventRegistration;
use App\Support\HtmlSanitiser;
use App\Support\Ics;

/**
 * A calendar file for an event. The file itself — UTC times, a stable UID,
 * a growing SEQUENCE, CRLF and folding, escaping — is `App\Support\Ics`,
 * which engineer visits and online meetings use too; this decides what an
 * event's file says.
 *
 * **Two files, one UID.** The public one (`GET /events/{slug}/calendar`) is
 * what anybody may download from the page: the title, the time, the place
 * and the page's address. The registrant's one, attached to their
 * confirmation, adds the two things only they are owed — the join link and
 * their manage link. Both carry `event-{id}` as the UID, so a registrant who
 * downloaded the public file first and then registered has one entry in
 * their calendar, updated, not two; and because the UID is the id rather
 * than the slug, renaming the event does not orphan it.
 *
 * The sequence is the event's `updated_at`, so a time moved in the console
 * and announced with "Tell everyone registered" outranks the file sent
 * before it.
 */
final class EventIcs
{
    /** What anybody may have. No join link, by construction: it is never read here. */
    public static function forEvent(Event $event): string
    {
        return self::build($event, self::summaryLine($event).'Details: '.$event->publicUrl());
    }

    /** What a registrant is sent: the public file plus their join link and their manage link. */
    public static function forRegistration(EventRegistration $registration): string
    {
        $registration->loadMissing('event');
        $event = $registration->event;

        $description = self::summaryLine($event);

        if ($event->format->isOnline() && filled($event->online_url)) {
            $description .= 'Join online: '.$event->online_url."\n";
        }

        $description .= 'Details: '.$event->publicUrl()."\n"
            .'Your registration ('.EventText::seats((int) $registration->seats).'), and the link to cancel it: '.$registration->manageUrl();

        return self::build($event, $description);
    }

    public static function filename(Event $event): string
    {
        return $event->slug.'.ics';
    }

    private static function build(Event $event, string $description): string
    {
        return Ics::event(
            uid: 'event-'.$event->id,
            seq: Ics::sequence($event->updated_at),
            start: $event->starts_at,
            end: $event->calendarEnd(),
            summary: (string) $event->title,
            description: $description,
            url: $event->publicUrl(),
            location: EventText::location($event),
            product: 'Events',
        );
    }

    /** The summary as one plain line, or nothing. */
    private static function summaryLine(Event $event): string
    {
        $summary = trim(HtmlSanitiser::toText($event->summary));

        return $summary === '' ? '' : $summary."\n";
    }
}
