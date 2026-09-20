<?php

namespace App\Support\Newsletter;

use App\Enums\SuppressionReason;
use App\Models\NewsletterCampaignRecipient;
use App\Models\NewsletterSuppression;
use App\Models\Setting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * A mail provider telling us an address is dead, or that somebody complained.
 *
 * Until this existed a hard bounce was suppressed only when a person noticed it
 * and typed the address in. That is the one gap in the newsletter that degrades
 * the sending domain's reputation **on its own**: every campaign goes on
 * mailing addresses the provider has already told us are gone, and mailbox
 * providers read a rising bounce rate as a sender who does not clean their
 * list. Nothing in the console could show it, because nothing knew.
 *
 * Modelled on the payment webhook, and for the same reasons:
 *
 * - **It always answers 200.** A provider reads anything else as "retry", so
 *   refusing loudly turns one delivery into an escalating retry storm — and a
 *   retried bad signature is still a bad signature. It also tells whoever is
 *   probing which of their guesses parsed.
 * - **The signature is computed over what the provider actually signed**, never
 *   over a re-encoded array.
 * - **Unverified means acted on, not answered on.** Nothing is written.
 *
 * The security property that matters here is the opposite of the payment
 * webhook's. There, a forged call would mark an order paid; here it would
 * *suppress* addresses — a way for anyone who finds the URL to quietly remove
 * the client's entire list from every future campaign, which nobody would
 * notice until a campaign reported an audience of nothing. So the shared secret
 * is **required**: with none configured this accepts nothing at all.
 */
class BounceWebhook
{
    /**
     * Providers with a webhook worth having.
     *
     * `smtp`, `google` and `log` are absent because they have none — a plain
     * SMTP relay reports a bounce by mailing a delivery-status notification to
     * the envelope sender, which is a mailbox to read rather than a request to
     * receive, and reading one is a different feature.
     *
     * `ses` is absent deliberately too, and not for want of an event stream:
     * SES publishes through SNS, whose messages are signed with a certificate
     * the receiver must **fetch and validate per message**. That is an
     * uncontrolled network call on the request path, which this project has
     * already measured the cost of once at 12.5 seconds — and the AWS SDK that
     * does it properly is the ~50MB dependency `MailTransport` deliberately
     * does not ship. It is a real piece of work, not a line.
     */
    public const PROVIDERS = ['mailgun', 'brevo'];

    public static function handle(string $provider, Request $request): void
    {
        if (! in_array($provider, self::PROVIDERS, true)) {
            return;
        }

        $secret = Setting::get('newsletter_webhook_secret');

        if (! is_string($secret) || $secret === '') {
            /*
             * Warning, not info: both .env files ship LOG_LEVEL=warning, so an
             * info line is discarded — and this is the only trace that somebody
             * has pointed a provider at an endpoint that is silently ignoring
             * it. The same reasoning as the password-reset audit line.
             */
            Log::warning('Newsletter bounce webhook received with no secret configured', [
                'provider' => $provider,
            ]);

            return;
        }

        if (! self::verify($provider, $request, $secret)) {
            Log::warning('Newsletter bounce webhook failed verification', ['provider' => $provider]);

            return;
        }

        foreach (self::events($provider, $request) as [$email, $reason]) {
            self::suppress($email, $reason, $provider);
        }
    }

    /**
     * Does this delivery prove it came from the provider we configured?
     *
     * Mailgun signs; Brevo does not, so it gets a shared secret in a header.
     * Both comparisons are `hash_equals` — a `===` on a secret is a timing
     * oracle, and one that can be probed at whatever rate the attacker likes
     * because this route is deliberately un-throttled.
     */
    private static function verify(string $provider, Request $request, string $secret): bool
    {
        if ($provider === 'mailgun') {
            /*
             * HMAC-SHA256 over `timestamp . token`, which is what Mailgun
             * documents and what it actually signs — not the body.
             *
             * **This is the webhook *signing key*, not the API key.** They are
             * two different secrets in the same dashboard, and using one where
             * the other belongs produces a signature that never matches, which
             * reads as "bounces stopped working" rather than as a
             * misconfiguration. Exactly the trap Razorpay's two secrets set,
             * and the one Mailgun's own `secret` versus Brevo's `key` already
             * sprang in `MailSettingsProvider`.
             */
            $signature = $request->input('signature', []);

            $timestamp = (string) ($signature['timestamp'] ?? '');
            $token = (string) ($signature['token'] ?? '');
            $given = (string) ($signature['signature'] ?? '');

            if ($timestamp === '' || $token === '' || $given === '') {
                return false;
            }

            /*
             * A replay window. Mailgun's signature is valid for ever without
             * one, so a delivery captured off the wire could be replayed a year
             * later — which for this endpoint means re-suppressing addresses
             * staff had since lifted.
             */
            if (abs(time() - (int) $timestamp) > 900) {
                return false;
            }

            return hash_equals(
                hash_hmac('sha256', $timestamp.$token, $secret),
                $given
            );
        }

        // Brevo publishes no signature, so the secret travels in a header the
        // sender controls and nothing else does.
        return hash_equals($secret, (string) $request->header('X-Webhook-Secret', ''));
    }

    /**
     * The address and reason for each event in the payload.
     *
     * **Only permanent failures and complaints.** A soft bounce is a full
     * mailbox, a greylist or an hour of downstream downtime, and suppressing on
     * one removes a real customer permanently for a problem that fixes itself
     * — the opposite of what this exists to do. Providers report far more event
     * types than these; the rest are deliberately dropped rather than guessed
     * at.
     *
     * @return array<int, array{0: string, 1: SuppressionReason}>
     */
    private static function events(string $provider, Request $request): array
    {
        $out = [];

        if ($provider === 'mailgun') {
            $data = (array) $request->input('event-data', []);
            $event = (string) ($data['event'] ?? '');
            $email = (string) (($data['recipient'] ?? null) ?: '');

            // `severity` is what separates a dead mailbox from a bad afternoon.
            $severity = (string) ($data['severity'] ?? '');

            if ($event === 'failed' && $severity === 'permanent') {
                $out[] = [$email, SuppressionReason::HardBounce];
            } elseif ($event === 'complained') {
                $out[] = [$email, SuppressionReason::Complaint];
            }

            return array_values(array_filter($out, fn ($e) => $e[0] !== ''));
        }

        /*
         * Brevo posts one event per request, but its batch endpoint posts a
         * list — so both shapes are read rather than assuming the one seen
         * first. A payload that is neither yields nothing, which is the right
         * answer for something this does not recognise.
         */
        $payload = $request->all();
        $rows = array_is_list($payload) ? $payload : [$payload];

        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }

            $event = (string) ($row['event'] ?? '');
            $email = (string) (($row['email'] ?? null) ?: '');

            if ($email === '') {
                continue;
            }

            // `blocked` is Brevo's own permanent refusal for that address, so
            // it belongs here; `soft_bounce` and `deferred` deliberately do not.
            if ($event === 'hard_bounce' || $event === 'blocked') {
                $out[] = [$email, SuppressionReason::HardBounce];
            } elseif ($event === 'spam' || $event === 'complaint') {
                $out[] = [$email, SuppressionReason::Complaint];
            }
        }

        return $out;
    }

    /**
     * Suppress the address, and record it against the campaign where we can.
     *
     * `NewsletterSuppression::add()` is idempotent and keeps the **first**
     * reason, so an address that unsubscribed and later bounces stays an
     * unsubscribe — which matters, because staff may lift a bounce and may not
     * lift somebody's decision.
     *
     * The campaign is found from the recipient rows rather than trusted from
     * the payload: a provider's own message id means nothing here, and a
     * campaign id a caller could choose is a campaign id a caller could point
     * at somebody else's send.
     */
    private static function suppress(string $email, SuppressionReason $reason, string $provider): void
    {
        $email = Str::lower(trim($email));

        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return;
        }

        $campaignId = NewsletterCampaignRecipient::query()
            ->where('email', $email)
            ->latest('id')
            ->value('newsletter_campaign_id');

        NewsletterSuppression::add(
            $email,
            $reason,
            'Reported by '.$provider.'.',
            $campaignId !== null ? (int) $campaignId : null,
        );
    }
}
