<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\SubscriberStatus;
use App\Enums\SuppressionReason;
use App\Http\Controllers\Controller;
use App\Models\NewsletterCampaignRecipient;
use App\Models\NewsletterEvent;
use App\Models\NewsletterGroup;
use App\Models\NewsletterLink;
use App\Models\NewsletterSubscriber;
use App\Models\NewsletterSuppression;
use App\Models\Setting;
use App\Support\Newsletter\BounceWebhook;
use App\Support\Newsletter\SubscriberIntake;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

/**
 * The public half: signing up, opting out, and the two tracking endpoints.
 *
 * Everything here is unauthenticated and reachable by anyone who has a link,
 * so the rules are the ones the rest of this application already follows for
 * public endpoints — identical answers whatever the truth, and nothing in a
 * response that says whether an address is known.
 */
class NewsletterController extends Controller
{
    /**
     * Sign up from the site.
     *
     * **Answers the same 202 for everything**, exactly as `/auth/register`
     * does: a new address, one already on the list, a suppressed one and a
     * honeypot submission are indistinguishable. Anything else makes this a
     * membership oracle — post addresses, read which come back "already
     * subscribed", and you have a list of this company's customers.
     */
    public function subscribe(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'email:rfc', 'max:190'],
            'first_name' => ['nullable', 'string', 'max:100'],
            'last_name' => ['nullable', 'string', 'max:100'],
            'company' => ['nullable', 'string', 'max:150'],
            // The honeypot, the same field name the contact form uses so
            // there is one convention rather than two.
            'website' => ['nullable', 'string', 'max:200'],
        ]);

        $answer = response()->json([
            'message' => 'Thank you. If that address is not already on the list, you will hear from us soon.',
        ], 202);

        // A filled honeypot gets the ordinary success response and stores
        // nothing. Telling a bot it was caught is telling it what to change.
        if (filled($data['website'] ?? null)) {
            return $answer;
        }

        if (Setting::get('newsletter_signup_enabled') === '0') {
            return response()->json(['message' => 'Newsletter signup is closed.'], 403);
        }

        $group = NewsletterGroup::where('slug', 'general-newsletter')->first();

        SubscriberIntake::take(
            $data['email'],
            $data,
            $group ? [$group->id] : [],
            'signup',
        );

        return $answer;
    }

    /**
     * The tracking pixel.
     *
     * Always returns the same 1x1 GIF, in every case — unknown token, expired
     * campaign, tracking switched off. A response that varied would let
     * anybody test whether a token is real, and the image is going into an
     * email client that will render whatever comes back regardless.
     */
    public function open(string $token): Response
    {
        $recipient = NewsletterCampaignRecipient::where('token', $token)->first();

        if ($recipient !== null) {
            /*
             * `opened_at` is stamped once, on the first open, and never
             * overwritten. The unique-open rate is counted from this column
             * and the total from the events, so overwriting it would make
             * "when did they open it" mean "when did they last look".
             */
            if ($recipient->opened_at === null) {
                $recipient->forceFill(['opened_at' => now()])->save();
            }

            NewsletterEvent::create([
                'newsletter_campaign_id' => $recipient->newsletter_campaign_id,
                'newsletter_subscriber_id' => $recipient->newsletter_subscriber_id,
                'event_type' => 'opened',
                'ip_address' => request()->ip(),
                'user_agent' => mb_substr((string) request()->userAgent(), 0, 390),
            ]);
        }

        return response(base64_decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), 200, [
            'Content-Type' => 'image/gif',
            // Or the client caches the pixel and the second open is invisible.
            'Cache-Control' => 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma' => 'no-cache',
        ]);
    }

    /**
     * A tracked link: record, then redirect.
     *
     * A bad token redirects to the site's front page rather than showing an
     * error. The person clicked a link in an email expecting to arrive
     * somewhere; an error page because the tracking row was pruned is a
     * failure of ours presented as a failure of theirs.
     */
    public function click(string $token, int $link)
    {
        $row = NewsletterLink::find($link);
        $home = rtrim((string) config('app.frontend_url'), '/');

        if ($row === null) {
            return redirect()->away($home);
        }

        $recipient = NewsletterCampaignRecipient::where('token', $token)
            ->where('newsletter_campaign_id', $row->newsletter_campaign_id)
            ->first();

        if ($recipient !== null) {
            $first = $recipient->clicked_at === null;

            if ($first) {
                $recipient->forceFill(['clicked_at' => now()])->save();
            }

            NewsletterLink::whereKey($row->id)->update([
                'total_clicks' => DB::raw('total_clicks + 1'),
                // Unique per *person per link*, which is what makes "top
                // links" a ranking of interest rather than of enthusiasm.
                'unique_clicks' => DB::raw('unique_clicks + '.($this->firstClickOnLink($row->id, $recipient->newsletter_subscriber_id) ? 1 : 0)),
            ]);

            NewsletterEvent::create([
                'newsletter_campaign_id' => $row->newsletter_campaign_id,
                'newsletter_subscriber_id' => $recipient->newsletter_subscriber_id,
                'newsletter_link_id' => $row->id,
                'event_type' => 'clicked',
                'ip_address' => request()->ip(),
                'user_agent' => mb_substr((string) request()->userAgent(), 0, 390),
            ]);
        }

        return redirect()->away($row->url);
    }

    private function firstClickOnLink(int $linkId, ?int $subscriberId): bool
    {
        if ($subscriberId === null) {
            return true;
        }

        return ! NewsletterEvent::where('newsletter_link_id', $linkId)
            ->where('newsletter_subscriber_id', $subscriberId)
            ->where('event_type', 'clicked')
            ->exists();
    }

    /**
     * Who a token belongs to, so the unsubscribe page can say the address.
     *
     * Returns the address only — no name, no groups, no history. Enough to
     * confirm "you are unsubscribing this address" and nothing that would make
     * a guessed token worth guessing.
     */
    public function unsubscribeDetails(string $token): JsonResponse
    {
        $subscriber = NewsletterSubscriber::where('unsubscribe_token', $token)->first();

        if ($subscriber === null) {
            return response()->json(['message' => 'That link is no longer valid.'], 404);
        }

        return response()->json(['data' => [
            'email' => $subscriber->email,
            'already' => ! $subscriber->status->canReceive(),
        ]]);
    }

    /**
     * Opt out.
     *
     * **No confirmation step and no login**, which the specification is
     * explicit about and which is also simply right: every obstacle between
     * somebody deciding to leave and leaving converts an unsubscribe into a
     * spam complaint, and a complaint costs the sending domain far more.
     *
     * Idempotent, because `List-Unsubscribe-Post` means a mail client may fire
     * this without anybody visiting a page, and may fire it more than once.
     */
    /**
     * A mail provider reporting a hard bounce or a complaint.
     *
     * **Answers 200 to everything**, including a payload it cannot verify and a
     * provider it does not know. A provider reads anything else as "retry", so
     * refusing loudly turns one delivery into an escalating retry storm — and a
     * retried bad signature is still a bad signature. It also tells whoever is
     * probing which of their guesses parsed.
     *
     * All the judgement is in `BounceWebhook`, which writes nothing at all
     * without the configured shared secret: this endpoint *suppresses*
     * addresses, so an unauthenticated one is a way to quietly remove the whole
     * list from every future campaign.
     */
    public function bounceWebhook(Request $request, string $provider): JsonResponse
    {
        BounceWebhook::handle($provider, $request);

        return response()->json(['received' => true]);
    }

    public function unsubscribe(string $token): JsonResponse
    {
        $subscriber = NewsletterSubscriber::where('unsubscribe_token', $token)->first();

        if ($subscriber === null) {
            return response()->json(['message' => 'That link is no longer valid.'], 404);
        }

        if ($subscriber->status->canReceive()) {
            $subscriber->update([
                'status' => SubscriberStatus::Unsubscribed,
                'unsubscribed_at' => now(),
            ]);
        }

        // The suppression row is what actually holds: the subscriber row could
        // be deleted and re-imported from a spreadsheet, and this outlives it.
        NewsletterSuppression::add($subscriber->email, SuppressionReason::Unsubscribed);

        NewsletterCampaignRecipient::where('newsletter_subscriber_id', $subscriber->id)
            ->whereNull('unsubscribed_at')
            ->latest('id')
            ->limit(1)
            ->update(['unsubscribed_at' => now()]);

        return response()->json([
            'data' => ['email' => $subscriber->email],
            'message' => 'You have been unsubscribed. You will no longer receive marketing emails from us.',
        ]);
    }
}
