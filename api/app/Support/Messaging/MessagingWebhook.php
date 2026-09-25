<?php

namespace App\Support\Messaging;

use App\Enums\MessageChannel;
use App\Enums\MessageDeliveryStatus;
use App\Models\MessageDelivery;
use App\Models\MessageTemplate;
use App\Support\Messaging\Providers\ProviderEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * A messaging provider telling us something: a message's status moved, a
 * person replied STOP, a template was approved or rejected.
 *
 * The bounce webhook's rules, for the bounce webhook's reason:
 *
 * - **It always answers 200** (bar a provider's own handshake). A provider
 *   reads anything else as "retry", and a retried bad signature is still a
 *   bad signature.
 * - **It fails closed.** A forged STOP would opt people out in silence, so
 *   with no secret configured — or a signature that does not verify —
 *   nothing is written. The failure is logged at `warning`, the only trace
 *   of a provider pointed at an endpoint that is ignoring it.
 * - **A status only moves forward** (`MessageDeliveryStatus::rank()`),
 *   because callbacks arrive out of order.
 */
final class MessagingWebhook
{
    public static function handle(MessageChannel $channel, string $providerKey, Request $request): Response
    {
        $provider = $channel->provider($providerKey);

        if ($provider === null) {
            return response('', 200);
        }

        $client = $provider->client();

        $challenge = $client->challenge($request);
        if ($challenge !== null) {
            return $challenge;
        }

        if (! $client->verifyWebhook($request)) {
            Log::warning('Messaging webhook failed verification', ['channel' => $channel->value, 'provider' => $providerKey]);

            return response('', 200);
        }

        try {
            foreach ($client->webhookEvents($request) as $event) {
                self::apply($channel, $event);
            }
        } catch (\Throwable $e) {
            Log::warning('Messaging webhook could not be applied', ['channel' => $channel->value, 'error' => $e->getMessage()]);
        }

        return response('', 200);
    }

    private static function apply(MessageChannel $channel, ProviderEvent $event): void
    {
        if ($event->type === 'inbound' && $event->address !== null && Contacts::isStop((string) $event->text)) {
            Contacts::optOut($channel, $event->address, 'stop');

            return;
        }

        if ($event->type === 'status' && $event->messageId !== null && $event->status !== null) {
            $delivery = MessageDelivery::query()->where('channel', $channel->value)
                ->where('provider_message_id', $event->messageId)->first();

            if ($delivery === null || $event->status->rank() <= $delivery->status->rank()) {
                return;
            }

            $delivery->update(array_filter([
                'status' => $event->status,
                'delivered_at' => in_array($event->status, [MessageDeliveryStatus::Delivered, MessageDeliveryStatus::Read], true) ? ($delivery->delivered_at ?? now()) : null,
                'read_at' => $event->status === MessageDeliveryStatus::Read ? now() : null,
                'error' => $event->status === MessageDeliveryStatus::Failed ? mb_substr((string) ($event->error ?? 'The provider reported a failure.'), 0, 490) : null,
            ]));

            return;
        }

        if ($event->type === 'template' && $event->templateName !== null && $event->approval !== null) {
            MessageTemplate::query()->where('channel', $channel->value)
                ->where(fn ($q) => $q->where('provider_template_name', $event->templateName)
                    ->orWhere(fn ($q) => $q->whereNull('provider_template_name')->where('key', $event->templateName)))
                ->get()
                ->each(fn (MessageTemplate $t) => $t->update([
                    'approval_status' => $event->approval,
                    'approval_reason' => $event->error,
                    'synced_at' => now(),
                ]));
        }
    }
}
