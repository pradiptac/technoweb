<?php

namespace App\Support\Tickets;

use App\Enums\SurveyRating;
use App\Models\Setting;
use App\Models\Ticket;
use App\Models\TicketSurvey;
use App\Notifications\TicketSurveyRequested;
use App\Support\Notifier;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The satisfaction survey at the end of a ticket (2026-09-30).
 *
 * `request()` is called from the `Ticket` model when a save lands on
 * `Closed`, so every door that closes one — the desk's status change, the
 * bulk action, the customer's own Close button, the mailbox piper — sends it
 * from one place and a door added later is covered.
 *
 * **Asked once per ticket, and the row is written first.** `ticket_surveys`
 * is unique on `ticket_id`: a ticket that is reopened and closed again finds
 * its row and asks nothing, and two saves racing each other cannot both send.
 * The row exists before the email is queued, so a send that fails is still a
 * ticket that has been asked, never a ticket that is asked again every time
 * somebody touches it — the rule the review requests follow.
 *
 * **Never fails the close.** The customer's ticket is already closed by the
 * time this runs; a problem here is logged and swallowed, like `Notifier`.
 * A merged ticket is not asked: it was closed to make one thread, not
 * because anything was resolved, and the ticket it moved into will ask.
 */
class Survey
{
    public const COMMENT_MAX = 1000;

    public static function enabled(): bool
    {
        return filter_var(Setting::get('ticket_survey_enabled', true), FILTER_VALIDATE_BOOLEAN);
    }

    public static function request(Ticket $ticket): void
    {
        if (! self::enabled() || $ticket->merged_into_id !== null) {
            return;
        }

        try {
            $ticket->loadMissing('customer');
            $customer = $ticket->customer;

            if ($customer === null || blank($customer->email)) {
                return;
            }

            $survey = TicketSurvey::firstOrCreate(
                ['ticket_id' => $ticket->id],
                ['token' => bin2hex(random_bytes(32)), 'sent_at' => now()],
            );

            if (! $survey->wasRecentlyCreated) {
                return;
            }

            Notifier::send($customer, new TicketSurveyRequested($ticket, $survey));
        } catch (Throwable $e) {
            Log::warning('Ticket survey was not sent', ['ticket' => $ticket->reference, 'error' => $e->getMessage()]);
        }
    }

    /** The survey page on the website — with a rating chosen, or without. */
    public static function url(TicketSurvey $survey, ?SurveyRating $rating = null): string
    {
        $url = rtrim((string) config('app.frontend_url'), '/').'/ticket-survey/'.$survey->token;

        return $rating === null ? $url : $url.'?rating='.$rating->value;
    }

    /**
     * The five buttons, as email HTML: inline styles and plain anchors,
     * because that is the only thing every mail client agrees about. They
     * wrap on a narrow screen rather than overflowing it.
     */
    public static function buttonsHtml(TicketSurvey $survey): string
    {
        return '<div style="margin:16px 0">'.collect(SurveyRating::cases())->map(fn (SurveyRating $r) => '<a href="'
            .e(self::url($survey, $r)).'" style="display:inline-block;margin:0 8px 8px 0;padding:12px 20px;background:'
            .$r->colour().';color:#ffffff;font-weight:600;text-decoration:none;border-radius:6px">'
            .e($r->label()).'</a>')->implode('').'</div>';
    }
}
