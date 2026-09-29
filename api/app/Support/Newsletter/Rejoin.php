<?php

namespace App\Support\Newsletter;

use App\Enums\SubscriberStatus;
use App\Enums\SuppressionReason;
use App\Models\NewsletterRejoinRequest;
use App\Models\NewsletterSubscriber;
use App\Models\NewsletterSuppression;
use App\Notifications\NewsletterRejoinRequested;
use App\Support\Notifier;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Somebody who unsubscribed, coming back — by confirming it from their inbox.
 *
 * An unsubscribe is the person's decision and only the person may reverse it:
 * staff cannot, an import cannot, and neither can a signup form, which anybody
 * can type anybody's address into. So a signup for an address suppressed for
 * its **own unsubscribe** changes nothing by itself; it mails that address a
 * link, and following the link is the reversal. The form still answers the
 * same 202 as for every other address — the email is the only thing that
 * differs, and it goes to the one party entitled to know.
 *
 * **A complaint, a bounce or a staff entry is never lifted here.** A spam
 * complaint is the strongest "never again" a person can send, and the mail
 * provider holds it against the domain whatever this table says; a bounce and
 * a staff entry are facts about a mailbox and decisions of the desk, and a
 * link clicked in an inbox proves nothing about either. For those the signup
 * stays silently ignored, as it always was.
 *
 * One confirmation per address per day, silently — the form is public, and
 * without it the signup becomes a way to send a named address an email every
 * few seconds from our domain.
 */
class Rejoin
{
    /** How long the link works. */
    public const DAYS = 7;

    /** One confirmation email per address in this many hours. */
    public const THROTTLE_HOURS = 24;

    /**
     * Offer a way back, when the address is suppressed for its own unsubscribe.
     *
     * Never throws: the caller answers the same 202 for every address, and an
     * exception here would be a 500 that only a suppressed address can
     * produce — a membership oracle by another route.
     *
     * @param  array<string, mixed>  $details  first_name, last_name, company from the new signup
     * @param  array<int, int>  $groupIds  the groups the new signup would have joined
     */
    public static function offer(string $email, array $details = [], array $groupIds = []): void
    {
        $email = Str::lower(trim($email));

        try {
            $suppression = NewsletterSuppression::where('email', $email)->first();

            if ($suppression === null || $suppression->reason !== SuppressionReason::Unsubscribed) {
                return;
            }

            $recent = NewsletterRejoinRequest::where('email', $email)
                ->where('created_at', '>=', now()->subHours(self::THROTTLE_HOURS))
                ->exists();

            if ($recent) {
                return;
            }

            // A new link retires any older one still outstanding, the rule a
            // sign-in code follows: three signups must not mean three live links.
            NewsletterRejoinRequest::where('email', $email)->whereNull('confirmed_at')->delete();

            $token = Str::random(64);

            NewsletterRejoinRequest::create([
                'email' => $email,
                'token_hash' => NewsletterRejoinRequest::hash($token),
                'group_ids' => array_values(array_map('intval', $groupIds)),
                'details' => array_intersect_key($details, array_flip(['first_name', 'last_name', 'company'])),
                'expires_at' => now()->addDays(self::DAYS),
            ]);

            Notifier::to($email, new NewsletterRejoinRequested($token, self::DAYS));
        } catch (Throwable $e) {
            Log::warning('Newsletter rejoin could not be offered', ['error' => $e->getMessage()]);
        }
    }

    /**
     * Whose link this is, for the page — or null for every kind of dead link.
     *
     * @return array{email: string, confirmed: bool}|null
     */
    public static function details(string $token): ?array
    {
        $row = self::find($token);

        if ($row === null) {
            return null;
        }

        if ($row->confirmed_at !== null) {
            return self::stillBack($row->email) ? ['email' => $row->email, 'confirmed' => true] : null;
        }

        if (! self::usable($row)) {
            return null;
        }

        return ['email' => $row->email, 'confirmed' => false];
    }

    /**
     * Follow the link: lift the unsubscribe, make the subscriber active again.
     *
     * Returns the address, or null for an unknown, expired or retired link —
     * one answer for all of them. **Idempotent**: a second press of a link
     * already confirmed answers the same success while the address is still
     * on the list, because a double click or a mail client fetching twice must
     * not tell somebody who just came back that their link is dead. Once they
     * have unsubscribed again, the old link is dead: it cannot be kept and
     * replayed to undo a later decision.
     */
    public static function confirm(string $token): ?string
    {
        $row = self::find($token);

        if ($row === null) {
            return null;
        }

        if ($row->confirmed_at !== null) {
            return self::stillBack($row->email) ? $row->email : null;
        }

        if (! self::usable($row)) {
            return null;
        }

        return DB::transaction(function () use ($row): ?string {
            // Claimed with a conditional UPDATE: two presses racing must not
            // both lift, join and enrol — the `SignInCodes::consume()` shape.
            $claimed = NewsletterRejoinRequest::whereKey($row->id)
                ->whereNull('confirmed_at')
                ->update(['confirmed_at' => now(), 'updated_at' => now()]);

            if ($claimed === 0) {
                return self::stillBack($row->email) ? $row->email : null;
            }

            NewsletterSuppression::where('email', $row->email)
                ->where('reason', SuppressionReason::Unsubscribed->value)
                ->delete();

            $subscriber = NewsletterSubscriber::where('email', $row->email)->first();

            if ($subscriber !== null && ! $subscriber->status->canReceive()) {
                $subscriber->update([
                    'status' => SubscriberStatus::Active,
                    'unsubscribed_at' => null,
                    'subscribed_at' => now(),
                ]);
            }

            // Everything else — a deleted row re-created, the name filled in
            // where blank, the groups the signup asked for — is the ordinary
            // intake, now that nothing stands in its way.
            SubscriberIntake::take($row->email, $row->details ?? [], $row->group_ids ?? [], 'signup');

            return $row->email;
        });
    }

    private static function find(string $token): ?NewsletterRejoinRequest
    {
        if (strlen($token) !== 64) {
            return null;
        }

        return NewsletterRejoinRequest::where('token_hash', NewsletterRejoinRequest::hash($token))->first();
    }

    /**
     * An unconfirmed link that may still be followed: in date, and the address
     * still suppressed only for its own unsubscribe. A suppression that has
     * since become a complaint — or a desk entry — is not the person's to lift.
     */
    private static function usable(NewsletterRejoinRequest $row): bool
    {
        if ($row->expires_at->isPast()) {
            return false;
        }

        $suppression = NewsletterSuppression::where('email', $row->email)->first();

        return $suppression === null || $suppression->reason === SuppressionReason::Unsubscribed;
    }

    /** Whether a confirmed rejoin still stands: not suppressed, and receiving. */
    private static function stillBack(string $email): bool
    {
        if (NewsletterSuppression::has($email)) {
            return false;
        }

        $subscriber = NewsletterSubscriber::where('email', $email)->first();

        return $subscriber !== null && $subscriber->status->canReceive();
    }
}
