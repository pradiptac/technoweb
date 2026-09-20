<?php

namespace Tests\Feature;

use App\Enums\SuppressionReason;
use App\Models\NewsletterSuppression;
use App\Models\Setting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A provider telling us an address is dead.
 *
 * Bounce handling was the one gap in the newsletter that degrades the sending
 * domain's reputation on its own: a hard bounce was suppressed only when a
 * person noticed and typed the address in, so every campaign went on mailing
 * addresses the provider had already reported gone.
 *
 * The security property here is the inverse of the payment webhook's. A forged
 * payment webhook marks an order paid; a forged *bounce* webhook **suppresses**
 * addresses — a way for anyone who finds the URL to remove the client's whole
 * list from every future campaign, which nobody would notice until a send
 * reported an audience of nothing. So most of what these tests pin is what the
 * endpoint refuses to do.
 */
class BounceWebhookTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'a-shared-secret-nobody-else-knows';

    /**
     * Written through `Setting::put()`, never with a raw `updateOrCreate`.
     *
     * The row is marked `is_secret`, so it is **encrypted at rest** and
     * `Setting::get()` decrypts on the way out. A test that wrote the value
     * straight into the column would store plaintext, fail to decrypt, and see
     * a null secret — which makes every acceptance test fail while every
     * refusal test passes, and reads exactly like the webhook being broken.
     * That is what happened on the first run of this file.
     */
    private function withSecret(): void
    {
        Setting::updateOrCreate(
            ['key' => 'newsletter_webhook_secret'],
            ['group' => 'newsletter', 'type' => 'string', 'is_secret' => true],
        );

        $this->assertTrue(Setting::put('newsletter_webhook_secret', self::SECRET));
    }

    /** @return array<string, mixed> */
    private function mailgunPayload(string $email, string $event, string $severity = 'permanent', ?int $timestamp = null): array
    {
        $timestamp = $timestamp ?? time();
        $token = 'a-token';

        return [
            'signature' => [
                'timestamp' => (string) $timestamp,
                'token' => $token,
                // Over `timestamp . token`, which is what Mailgun signs — not
                // the body. Signing the body here would make the test agree
                // with a wrong implementation.
                'signature' => hash_hmac('sha256', $timestamp.$token, self::SECRET),
            ],
            'event-data' => ['event' => $event, 'recipient' => $email, 'severity' => $severity],
        ];
    }

    public function test_a_signed_mailgun_hard_bounce_suppresses_the_address(): void
    {
        $this->withSecret();

        $this->postJson('/api/v1/newsletter/webhooks/mailgun', $this->mailgunPayload('gone@example.in', 'failed'))
            ->assertOk()
            ->assertJson(['received' => true]);

        $row = NewsletterSuppression::where('email', 'gone@example.in')->first();

        $this->assertNotNull($row);
        $this->assertSame(SuppressionReason::HardBounce, $row->reason);
    }

    public function test_a_complaint_is_recorded_as_a_complaint(): void
    {
        $this->withSecret();

        $this->postJson('/api/v1/newsletter/webhooks/mailgun', $this->mailgunPayload('cross@example.in', 'complained'))
            ->assertOk();

        $this->assertSame(
            SuppressionReason::Complaint,
            NewsletterSuppression::where('email', 'cross@example.in')->first()?->reason,
        );
    }

    /**
     * A soft bounce is a full mailbox or an hour of downtime.
     *
     * Suppressing on one removes a real customer permanently for a problem that
     * fixes itself, which is the opposite of what this feature is for.
     */
    public function test_a_temporary_failure_is_ignored(): void
    {
        $this->withSecret();

        $this->postJson(
            '/api/v1/newsletter/webhooks/mailgun',
            $this->mailgunPayload('busy@example.in', 'failed', 'temporary'),
        )->assertOk();

        $this->assertDatabaseCount('newsletter_suppressions', 0);
    }

    /** The whole point of the shared secret. */
    public function test_an_unsigned_call_suppresses_nothing(): void
    {
        $this->withSecret();

        $payload = $this->mailgunPayload('victim@example.in', 'failed');
        $payload['signature']['signature'] = str_repeat('0', 64);

        $this->postJson('/api/v1/newsletter/webhooks/mailgun', $payload)->assertOk();

        $this->assertDatabaseCount('newsletter_suppressions', 0);
    }

    /**
     * With no secret configured the endpoint is inert.
     *
     * Fail *closed*: an install that has not been given a secret must not have
     * an open suppression endpoint sitting on it, and the alternative — accept
     * everything until somebody configures it — is exactly backwards.
     */
    public function test_nothing_is_accepted_before_a_secret_is_configured(): void
    {
        $this->postJson('/api/v1/newsletter/webhooks/mailgun', $this->mailgunPayload('gone@example.in', 'failed'))
            ->assertOk();

        $this->assertDatabaseCount('newsletter_suppressions', 0);
    }

    /**
     * A captured delivery cannot be replayed later.
     *
     * Mailgun's signature is valid for ever without a window, so an old one
     * replayed would re-suppress addresses staff had since lifted.
     */
    public function test_a_stale_signature_is_refused(): void
    {
        $this->withSecret();

        $this->postJson(
            '/api/v1/newsletter/webhooks/mailgun',
            $this->mailgunPayload('old@example.in', 'failed', 'permanent', time() - 7200),
        )->assertOk();

        $this->assertDatabaseCount('newsletter_suppressions', 0);
    }

    public function test_brevo_is_authorised_by_a_header(): void
    {
        $this->withSecret();

        $this->withHeaders(['X-Webhook-Secret' => self::SECRET])
            ->postJson('/api/v1/newsletter/webhooks/brevo', ['event' => 'hard_bounce', 'email' => 'dead@example.in'])
            ->assertOk();

        $this->assertSame(
            SuppressionReason::HardBounce,
            NewsletterSuppression::where('email', 'dead@example.in')->first()?->reason,
        );
    }

    /** Brevo's batch endpoint posts a list; the single endpoint posts an object. */
    public function test_brevo_accepts_a_batch(): void
    {
        $this->withSecret();

        $this->withHeaders(['X-Webhook-Secret' => self::SECRET])
            ->postJson('/api/v1/newsletter/webhooks/brevo', [
                ['event' => 'hard_bounce', 'email' => 'one@example.in'],
                ['event' => 'spam', 'email' => 'two@example.in'],
                ['event' => 'soft_bounce', 'email' => 'three@example.in'],
            ])
            ->assertOk();

        $this->assertTrue(NewsletterSuppression::has('one@example.in'));
        $this->assertTrue(NewsletterSuppression::has('two@example.in'));
        // The soft bounce is not a suppression.
        $this->assertFalse(NewsletterSuppression::has('three@example.in'));
    }

    /**
     * An unsubscribe outranks a later bounce.
     *
     * `add()` keeps the first reason, and the distinction is not cosmetic:
     * staff may lift a hard bounce and may **not** lift somebody's decision, so
     * overwriting one with the other would hand back a choice that was never
     * ours to reverse.
     */
    public function test_a_bounce_does_not_overwrite_an_unsubscribe(): void
    {
        $this->withSecret();

        NewsletterSuppression::add('left@example.in', SuppressionReason::Unsubscribed);

        $this->postJson('/api/v1/newsletter/webhooks/mailgun', $this->mailgunPayload('left@example.in', 'failed'))
            ->assertOk();

        $this->assertSame(
            SuppressionReason::Unsubscribed,
            NewsletterSuppression::where('email', 'left@example.in')->first()?->reason,
        );
        $this->assertDatabaseCount('newsletter_suppressions', 1);

        /*
         * And prove the delivery was acted on at all.
         *
         * Without this the test passes just as happily when the webhook is
         * refusing everything — the pre-existing row simply stays put. It did
         * exactly that on the first run of this file, which is the whole
         * argument for checking that the mechanism ran rather than only that
         * the outcome looks right.
         */
        $this->postJson('/api/v1/newsletter/webhooks/mailgun', $this->mailgunPayload('other@example.in', 'failed'))
            ->assertOk();

        $this->assertTrue(NewsletterSuppression::has('other@example.in'));
    }

    /** An unknown provider is answered, not acted on. */
    public function test_an_unknown_provider_writes_nothing(): void
    {
        $this->withSecret();

        $this->postJson('/api/v1/newsletter/webhooks/postmark', ['event' => 'hard_bounce', 'email' => 'x@example.in'])
            ->assertOk()
            ->assertJson(['received' => true]);

        $this->assertDatabaseCount('newsletter_suppressions', 0);
    }
}
