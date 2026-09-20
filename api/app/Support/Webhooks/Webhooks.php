<?php

namespace App\Support\Webhooks;

use App\Enums\WebhookEvent;
use App\Jobs\DeliverWebhook;
use App\Models\Webhook;
use App\Models\WebhookDelivery;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;

/**
 * Tells every subscribed hook that something happened, and refuses to let
 * that break the thing that happened.
 *
 * Modelled on `Notifier`, for the same reason: the ticket, the order or the
 * lead is already committed by the time this runs, and a request that fails
 * because somebody else's server is down — or because this table could not
 * be written — is a request the customer sends again. So `emit()` is wrapped
 * whole: a failure is logged at `warning` (both `.env` files ship
 * `LOG_LEVEL=warning`, so `info` would be discarded) and never thrown.
 *
 * What it does is small on purpose. One `pending` delivery row per active
 * hook subscribed to the event, in the caller's transaction, and one queued
 * `DeliverWebhook` per row, dispatched **after commit** — so a checkout that
 * rolls back leaves neither a row nor a job behind, and a job can never run
 * before the row it names exists. The sending, the retries and the signature
 * are the job's.
 */
class Webhooks
{
    /** Where the active list is memoised for the request. The container, not a static: a static survives between tests. */
    private const ACTIVE = 'webhooks.active';

    /**
     * Announce an event to whoever subscribed to it.
     *
     * @param  array<string, mixed>  $data  the admin resource's shape, already resolved
     */
    public static function emit(WebhookEvent $event, array $data): void
    {
        try {
            $hooks = self::active()->filter(fn (Webhook $hook) => $hook->subscribesTo($event));

            foreach ($hooks as $hook) {
                self::queue($hook, $event, $data);
            }
        } catch (\Throwable $e) {
            // Deliberately swallowed: the caller's work is committed and a
            // webhook is an announcement of it, not a condition on it.
            Log::warning('Webhook could not be queued', [
                'event' => $event->value,
                'error' => mb_substr($e->getMessage(), 0, 300),
            ]);
        }
    }

    /**
     * One delivery to one named hook, subscribed or not.
     *
     * What the console's ping and redeliver buttons use: both are a person
     * asking for a specific send, so the subscription list is not consulted
     * and — unlike `emit()` — a failure here *is* the answer and is thrown.
     *
     * @param  array<string, mixed>  $data
     */
    public static function deliverTo(Webhook $hook, WebhookEvent $event, array $data): WebhookDelivery
    {
        return self::queue($hook, $event, $data);
    }

    /** @param  array<string, mixed>  $data */
    private static function queue(Webhook $hook, WebhookEvent $event, array $data): WebhookDelivery
    {
        $delivery = $hook->deliveries()->create([
            'event' => $event->value,
            'payload' => $data,
            'status' => WebhookDelivery::PENDING,
        ]);

        /*
         * After commit, or a rolled-back checkout would deliver `order.placed`
         * for an order that does not exist — the row goes with the rollback,
         * and a job that ran first would find nothing and do nothing, but a
         * job that ran *before* the rollback would have sent it. Outside a
         * transaction this dispatches at once.
         */
        DeliverWebhook::dispatch($delivery->id)->afterCommit();

        return $delivery;
    }

    /**
     * The active hooks, read once per request.
     *
     * Every ticket, order, lead and subscriber write asks this, so it is one
     * query per request rather than one per event. `Webhook::saved` and
     * `deleted` forget it, which is what keeps a hook created and an event
     * emitted in the same request honest with each other.
     *
     * @return Collection<int, Webhook>
     */
    private static function active(): Collection
    {
        if (app()->bound(self::ACTIVE)) {
            return app()->make(self::ACTIVE);
        }

        $hooks = Webhook::query()->where('is_active', true)->get();

        app()->instance(self::ACTIVE, $hooks);

        return $hooks;
    }

    public static function forgetActive(): void
    {
        app()->forgetInstance(self::ACTIVE);
    }

    /**
     * The signature a receiver should compute.
     *
     * `sha256=` + HMAC-SHA256 over `timestamp . "." . body`, keyed with the
     * hook's secret. The timestamp is in the signed string so a captured
     * delivery cannot be replayed a week later without the receiver being
     * able to notice; the body is the exact bytes on the wire.
     */
    public static function sign(string $secret, int $timestamp, string $body): string
    {
        return 'sha256='.hash_hmac('sha256', $timestamp.'.'.$body, $secret);
    }
}
