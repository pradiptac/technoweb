<?php

namespace App\Jobs;

use App\Models\WebhookDelivery;
use App\Support\Net\SafeHttp;
use App\Support\Net\UnsafeUrl;
use App\Support\Webhooks\Webhooks;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use RuntimeException;
use Throwable;

/**
 * One delivery, however many attempts it takes.
 *
 * Carries the delivery's id and nothing else: the payload was written to the
 * row when the event happened, so a retry an hour later sends what the event
 * said rather than what the record has since become, and a redelivery is a
 * new row with the same payload and a new id.
 *
 * **The bytes sent are the bytes signed.** `WebhookDelivery::envelope()`
 * encodes the JSON once; that string goes out as the body through
 * `withBody()` and into the HMAC as-is. Encoding twice — once to sign and
 * once to send — is how a receiver ends up verifying a signature over a body
 * that differs by one escaped slash, and the failure looks like a wrong
 * secret.
 *
 * Five attempts, backing off over about fourteen hours: a minute, five, thirty,
 * two hours, twelve. Anything but a 2xx — a 4xx, a 5xx, a refused connection,
 * a timeout — records what came back and throws, which is what asks the queue
 * for the next attempt; the fifth failure lands in `failed()`, which marks the
 * row and writes the server's own words onto the hook for the console to show.
 * A hook switched off between attempts is not sent to: the delivery is marked
 * failed with that reason rather than left pending for ever.
 */
class DeliverWebhook implements ShouldQueue
{
    use Queueable;

    public int $tries = 5;

    /** Longer than the request timeout below, so the worker outlives the send. */
    public int $timeout = 15;

    public const BACKOFF = [60, 300, 1800, 7200, 43200];

    public function __construct(public readonly int $deliveryId) {}

    /** @return array<int, int> */
    public function backoff(): array
    {
        return self::BACKOFF;
    }

    public function handle(): void
    {
        $delivery = WebhookDelivery::with('webhook')->find($this->deliveryId);

        // Pruned, or already done by an earlier attempt that the queue retried anyway.
        if ($delivery === null || $delivery->status === WebhookDelivery::DELIVERED) {
            return;
        }

        $hook = $delivery->webhook;

        if ($hook === null || ! $hook->is_active) {
            $delivery->forceFill([
                'status' => WebhookDelivery::FAILED,
                'response_excerpt' => 'The webhook was switched off before this delivery was attempted.',
                'next_attempt_at' => null,
            ])->save();

            return;
        }

        // Counted before the send, so an attempt the worker dies inside still counts as one.
        $delivery->forceFill(['attempts' => $delivery->attempts + 1])->save();

        /*
         * Where the request may go, decided here and pinned.
         *
         * The URL was checked when it was saved, by name; a public name can
         * still resolve to `127.0.0.1` or the metadata service, and the
         * response excerpt is shown in the console — which made a webhook a
         * way to *read* the inside of the network. So the host is resolved
         * now, every address it answers with must be public, and cURL is
         * told to use exactly those (`CURLOPT_RESOLVE`), so it cannot ask
         * DNS a second time and be given a different answer. `SafeHttp` is
         * where that lives, shared with the WordPress importer.
         */
        try {
            $request = SafeHttp::request($hook->url);
        } catch (UnsafeUrl $e) {
            $this->recordRefusal($delivery, null, $e->getMessage());

            throw new RuntimeException("{$hook->url}: {$e->getMessage()}");
        }

        $body = $delivery->envelope();
        $timestamp = time();

        try {
            $response = $request->withHeaders([
                'User-Agent' => 'Technoware-Webhooks/1.0',
                'X-Technoware-Event' => $delivery->event,
                'X-Technoware-Delivery' => (string) $delivery->id,
                'X-Technoware-Timestamp' => (string) $timestamp,
                'X-Technoware-Signature' => Webhooks::sign($hook->secret, $timestamp, $body),
            ])
                ->withBody($body, 'application/json')
                ->timeout(10)
                /*
                 * A redirect is a failure, not an instruction — the request
                 * `SafeHttp` hands back does not follow one. Followed, a 302
                 * from a public host to `http://169.254.169.254/` took the
                 * request past every check above, and to plain http.
                 */
                ->post($hook->url);
        } catch (ConnectionException $e) {
            $this->recordRefusal($delivery, null, $e->getMessage());

            throw $e;
        }

        if ($response->successful()) {
            $this->recordSuccess($delivery, $response);

            return;
        }

        $this->recordRefusal($delivery, $response->status(), $response->body());

        throw new RuntimeException("{$hook->url} answered {$response->status()}.");
    }

    /**
     * The fifth failure — or a hook that could not be attempted at all.
     *
     * The message is the server's own words, because "delivery failed" tells
     * an administrator nothing about which of the two ends to look at.
     */
    public function failed(?Throwable $e = null): void
    {
        $delivery = WebhookDelivery::with('webhook')->find($this->deliveryId);

        if ($delivery === null) {
            return;
        }

        $delivery->forceFill([
            'status' => WebhookDelivery::FAILED,
            'next_attempt_at' => null,
        ])->save();

        $delivery->webhook?->forceFill([
            'last_error' => mb_substr(
                sprintf('%s: %s', $delivery->event, $e?->getMessage() ?: 'delivery gave up'),
                0,
                500,
            ),
        ])->save();
    }

    private function recordSuccess(WebhookDelivery $delivery, Response $response): void
    {
        $delivery->forceFill([
            'status' => WebhookDelivery::DELIVERED,
            'response_status' => $response->status(),
            'response_excerpt' => self::excerpt($response->body()),
            'next_attempt_at' => null,
            'delivered_at' => now(),
        ])->save();

        $delivery->webhook?->forceFill(['last_delivered_at' => now(), 'last_error' => null])->save();
    }

    private function recordRefusal(WebhookDelivery $delivery, ?int $status, string $words): void
    {
        $delivery->forceFill([
            'response_status' => $status,
            'response_excerpt' => self::excerpt($words),
            // Where the queue will pick it up again, from the same table the
            // queue reads; null once there is no attempt left to schedule.
            'next_attempt_at' => $delivery->attempts < $this->tries
                ? now()->addSeconds(self::BACKOFF[min($delivery->attempts, count(self::BACKOFF)) - 1])
                : null,
        ])->save();
    }

    /** The first 500 characters of whatever came back, or null for nothing. */
    private static function excerpt(string $body): ?string
    {
        $body = trim($body);

        return $body === '' ? null : mb_substr($body, 0, 500);
    }
}
