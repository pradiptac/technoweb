<?php

namespace App\Support\Messaging;

use App\Enums\MessageDeliveryStatus;
use App\Enums\MessageEvent;
use App\Jobs\SendChannelMessage;
use App\Models\MessageAutomation;
use App\Models\MessageDelivery;
use App\Support\Mail\MailBrand;
use App\Support\QueueHealth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Tells a customer about an event on the non-email channels they opted in
 * to — WhatsApp, RCS, browser push.
 *
 * Called beside the email at every fire point (the order, ticket, basket and
 * wishlist events in `MessageEvent`). It must never fail the request that
 * caused it — the `Notifier` rule — and it sends nothing unless an automation
 * maps the event to an approved template on a configured channel and the
 * recipient holds an opt-in on that channel. A promotional event outside the
 * quiet-hours window is held until it opens, not dropped.
 *
 * What it does is write one `message_deliveries` row per contact and queue
 * one `SendChannelMessage` for it **after the caller's transaction commits**
 * — a checkout that rolls back must not have told anybody about an order
 * that does not exist. The send itself happens in the worker, so a slow
 * provider costs the request nothing — unless nothing is draining the
 * queue, when a transactional message is sent after the commit instead,
 * the `Notifier` rule for the same measured reason: a stopped scheduler
 * otherwise loses every message in silence.
 */
final class Messenger
{
    /**
     * @param  array<string, scalar|null>  $vars  placeholder values, see MessageEvent::placeholders()
     */
    public static function notify(MessageEvent $event, MessageRecipient $to, array $vars = []): void
    {
        try {
            self::queue($event, $to, $vars);
        } catch (\Throwable $e) {
            // Warning, not info: `LOG_LEVEL=warning` ships in both .env files.
            Log::warning('Messenger could not queue a message', ['event' => $event->value, 'error' => $e->getMessage()]);
        }
    }

    /** @param  array<string, scalar|null>  $vars */
    private static function queue(MessageEvent $event, MessageRecipient $to, array $vars): void
    {
        $automations = MessageAutomation::query()->with('template')
            ->where('event', $event->value)->where('is_enabled', true)->whereNotNull('message_template_id')
            ->get();

        if ($automations->isEmpty()) {
            return;
        }

        $vars = self::withDefaults($vars, $to->name);

        foreach ($automations as $automation) {
            $template = $automation->template;
            $channel = $automation->channel;

            if ($template === null || $template->channel !== $channel || ! $template->sendable() || ! $channel->ready()) {
                continue;
            }

            foreach (Contacts::forRecipient($channel, $to) as $contact) {
                $delivery = MessageDelivery::create([
                    'channel' => $channel->value,
                    'provider' => $channel->current()?->id(),
                    'event' => $event->value,
                    'message_template_id' => $template->id,
                    'message_contact_id' => $contact->id,
                    'address' => $contact->address,
                    'vars' => $vars,
                    'status' => MessageDeliveryStatus::Pending,
                ]);

                self::dispatch($delivery, $event->promotional());
            }
        }
    }

    /**
     * The three values every template may use, under what the caller gave.
     *
     * @param  array<string, scalar|null>  $vars
     * @return array<string, scalar|null>
     */
    public static function withDefaults(array $vars, ?string $name): array
    {
        $name = trim((string) $name);

        return $vars + [
            'customer_name' => $name,
            'first_name' => $name === '' ? '' : strtok($name, ' '),
            'site_name' => MailBrand::name(),
        ];
    }

    /** Queue one delivery — held to the window if promotional, after the caller's commit either way. */
    public static function dispatch(MessageDelivery $delivery, bool $promotional): void
    {
        $job = new SendChannelMessage($delivery->id);

        if ($promotional && ! QuietHours::allows()) {
            dispatch($job)->delay(QuietHours::nextOpening())->afterCommit();

            return;
        }

        if (config('queue.default') === 'sync' || QueueHealth::delivering()) {
            dispatch($job)->afterCommit();

            return;
        }

        DB::afterCommit(function () use ($job) {
            try {
                dispatch_sync($job);
            } catch (\Throwable $e) {
                Log::warning('A channel message could not be sent inline', ['error' => $e->getMessage()]);
            }
        });
    }
}
