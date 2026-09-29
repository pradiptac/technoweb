<?php

namespace App\Support\Meetings;

use App\Enums\MeetingGoogleStatus;
use App\Enums\MeetingStatus;
use App\Enums\MessageEvent;
use App\Enums\WebhookEvent;
use App\Http\Middleware\EnsurePortalEnabled;
use App\Models\Meeting;
use App\Models\MeetingEvent;
use App\Models\User;
use App\Notifications\MeetingBooked;
use App\Notifications\MeetingCancelled;
use App\Notifications\MeetingLinkReady;
use App\Notifications\MeetingReminder;
use App\Notifications\MeetingRescheduled;
use App\Notifications\MeetingScheduled;
use App\Notifications\MeetingSyncFailed;
use App\Support\Messaging\MessageRecipient;
use App\Support\Messaging\Messenger;
use App\Support\Notifier;
use App\Support\Webhooks\WebhookPayload;
use App\Support\Webhooks\Webhooks;
use Illuminate\Notifications\Notification;

/**
 * Who is told what about a meeting, and when (docs/meetings.md, "The
 * customer's confirmation is sent from the end of the sync").
 *
 * **The customer's confirmation waits for the calendar.** When Google makes
 * the event, its own invitation puts the meeting into the customer's
 * calendar, so our email carries the Meet link and no `.ics`; when Google
 * cannot (not connected, or failed for good), our email carries the `.ics`
 * and "the link will follow", and `meeting_link_ready` goes if a later retry
 * succeeds. So `afterSync()` — called by the listener at the end of every
 * sync, and by `MeetingSync` straight away when nothing is connected — is
 * what sends it.
 *
 * Which of the two a customer got is recorded in the trail
 * (`confirmation_sent`, `to_value` of `link` or `ics`), and that record
 * decides everything after: a move or a cancellation carries our `.ics`
 * exactly when the confirmation did, because whoever put the meeting into
 * the customer's calendar is who must move it — Google's `sendUpdates`, or
 * a file with the same UID and a higher SEQUENCE. A move before any
 * confirmation has gone sends no "moved" email: the confirmation, when it
 * goes, carries the new time.
 *
 * Every send goes through `Notifier`, `Messenger` or `Webhooks`, each of
 * which swallows its own failure.
 */
final class MeetingNotices
{
    public const CONFIRMED = 'confirmation_sent';

    public const LINK_SENT = 'link_sent';

    public const GOOGLE_FAILED = 'google_failed';

    public const GOOGLE_RETRIED = 'google_retried';

    public const REMINDED = 'reminded';

    /**
     * The end of a sync: the customer's confirmation, the "link is ready"
     * follow-up, or the desk's "could not add it to Google".
     */
    public static function afterSync(Meeting $meeting, MeetingGoogleStatus $before, ?string $previousMeetUrl): void
    {
        $meeting = $meeting->fresh(['meetingType']);

        if ($meeting === null || $meeting->status !== MeetingStatus::Scheduled) {
            return;
        }

        $confirmation = self::confirmation($meeting);

        switch ($meeting->google_status) {
            case MeetingGoogleStatus::Synced:
                // A link still being made is left for the sweeper; the
                // confirmation goes when it carries one.
                if (blank($meeting->meet_url)) {
                    return;
                }

                if ($confirmation === null) {
                    self::confirm($meeting, withIcs: false);

                    return;
                }

                // They were sent our file and "the link will follow": it has.
                if ($confirmation->to_value === 'ics' && ! self::has($meeting, self::LINK_SENT)) {
                    Notifier::to($meeting->email, new MeetingLinkReady($meeting));
                    $meeting->record(self::LINK_SENT, note: 'The Meet link was sent to the customer.');
                }

                return;

            case MeetingGoogleStatus::Failed:
                if ($meeting->google_attempts < MeetingSync::MAX_ATTEMPTS) {
                    return;
                }

                // Once per give-up: a Retry that fails again tells the desk again.
                if (self::lastOf($meeting, [self::GOOGLE_FAILED, self::GOOGLE_RETRIED]) !== self::GOOGLE_FAILED) {
                    self::toDesk(new MeetingSyncFailed($meeting));
                    $meeting->record(self::GOOGLE_FAILED, note: $meeting->google_error ? mb_substr((string) $meeting->google_error, 0, 500) : null);
                }

                if ($confirmation === null) {
                    self::confirm($meeting, withIcs: true);
                }

                return;

            case MeetingGoogleStatus::Off:
                if ($confirmation === null) {
                    self::confirm($meeting, withIcs: true);
                }

                return;

            case MeetingGoogleStatus::Pending:
                return;
        }
    }

    /**
     * A new booking: the desk and the host (with the agenda), the messaging
     * channels and the webhook. The customer's confirmation is the sync's.
     */
    public static function booked(Meeting $meeting): void
    {
        self::toDesk(new MeetingBooked($meeting));
        self::toHost($meeting);
        self::message(MessageEvent::MeetingScheduled, $meeting);
        Webhooks::emit(WebhookEvent::MeetingScheduled, fn () => WebhookPayload::meeting($meeting));
    }

    /**
     * A meeting moved. `$previous` is when it was, written out; a new host
     * is sent the booking with the agenda.
     */
    public static function moved(Meeting $meeting, string $previous, bool $hostChanged): void
    {
        $confirmation = self::confirmation($meeting);

        if ($confirmation !== null) {
            Notifier::to($meeting->email, new MeetingRescheduled($meeting, $previous, $confirmation->to_value === 'ics'));
        }

        if ($hostChanged) {
            self::toHost($meeting);
        }

        self::message(MessageEvent::MeetingRescheduled, $meeting);
        Webhooks::emit(WebhookEvent::MeetingRescheduled, fn () => WebhookPayload::meeting($meeting) + ['previous' => $previous]);
    }

    /** A meeting called off, by either side. */
    public static function cancelled(Meeting $meeting): void
    {
        $confirmation = self::confirmation($meeting);

        Notifier::to($meeting->email, new MeetingCancelled($meeting, $confirmation?->to_value === 'ics'));
        self::message(MessageEvent::MeetingCancelled, $meeting);
        Webhooks::emit(WebhookEvent::MeetingCancelled, fn () => WebhookPayload::meeting($meeting));
    }

    /** One reminder, whichever offset claimed it. */
    public static function remind(Meeting $meeting): void
    {
        Notifier::to($meeting->email, new MeetingReminder($meeting));
        self::message(MessageEvent::MeetingReminder, $meeting);
    }

    /** The trail line saying which confirmation the customer got, if any. */
    public static function confirmation(Meeting $meeting): ?MeetingEvent
    {
        return MeetingEvent::query()
            ->where('meeting_id', $meeting->id)
            ->where('type', self::CONFIRMED)
            ->latest('id')
            ->first();
    }

    /** The WhatsApp / RCS / push side, on the channels the customer opted into. */
    public static function message(MessageEvent $event, Meeting $meeting): void
    {
        Messenger::notify($event, new MessageRecipient($meeting->customer_id, $meeting->phone, $meeting->name), [
            'reference' => $meeting->reference,
            'meeting_type' => MeetingText::typeName($meeting),
            'meeting_date' => MeetingText::date($meeting->starts_at),
            'meeting_time' => MeetingText::time($meeting),
            'timezone' => MeetingText::timezone(),
            'starts_in' => MeetingText::startsIn($meeting),
            'host_name' => MeetingText::hostName($meeting),
            'meet_url' => (string) $meeting->meet_url,
            // The portal for an account holder; the token link for a guest —
            // and for everybody while the portal is switched off.
            'manage_url' => $meeting->customer_id && EnsurePortalEnabled::open() ? $meeting->portalUrl() : $meeting->manageUrl(),
        ]);
    }

    /** To the meetings address, else the sales inbox, else the site's sender. */
    public static function toDesk(Notification $notification): void
    {
        Notifier::route('meetings_email', $notification, Notifier::setting('sales_email'));
    }

    private static function toHost(Meeting $meeting): void
    {
        $host = $meeting->host_id ? User::query()->find($meeting->host_id) : null;

        if ($host !== null && filled($host->email)) {
            Notifier::to($host->email, new MeetingBooked($meeting));
        }
    }

    private static function confirm(Meeting $meeting, bool $withIcs): void
    {
        Notifier::to($meeting->email, new MeetingScheduled($meeting, $withIcs));

        $meeting->record(self::CONFIRMED, to: $withIcs ? 'ics' : 'link', note: $withIcs
            ? 'Confirmation sent to the customer with a calendar file.'
            : 'Confirmation sent to the customer with the Meet link.');
    }

    private static function has(Meeting $meeting, string $type): bool
    {
        return MeetingEvent::query()->where('meeting_id', $meeting->id)->where('type', $type)->exists();
    }

    /** @param  list<string>  $types */
    private static function lastOf(Meeting $meeting, array $types): ?string
    {
        $type = MeetingEvent::query()->where('meeting_id', $meeting->id)->whereIn('type', $types)
            ->latest('id')->value('type');

        return is_string($type) ? $type : null;
    }
}
