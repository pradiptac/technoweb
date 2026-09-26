<?php

namespace App\Support\Messaging;

use App\Enums\MessageDeliveryStatus;
use App\Models\MessageDelivery;
use App\Models\Setting;
use App\Support\Messaging\Providers\OutgoingMessage;
use App\Support\Messaging\Providers\ProviderException;

/**
 * Sends one delivery row, whichever source queued it — an event or a
 * broadcast batch.
 *
 * Everything is re-checked **at the moment of sending**, because a delivery
 * can wait hours for the quiet-hours window: the contact may have opted out,
 * the template may have lost its approval, the channel may have been
 * switched off. Each of those is `skipped` with the reason — nothing was
 * attempted, so it is not a failure. Only `pending` rows are sent, which is
 * the guard against a job run twice.
 */
final class ChannelSender
{
    public const SENT = 'sent';

    public const FAILED = 'failed';

    public const SKIPPED = 'skipped';

    public const LATER = 'later';

    public const NOOP = 'noop';

    public static function deliver(MessageDelivery $delivery): string
    {
        if ($delivery->status !== MessageDeliveryStatus::Pending) {
            return self::NOOP;
        }

        if ($delivery->isPromotional() && ! QuietHours::allows()) {
            return self::LATER;
        }

        $contact = $delivery->contact;

        if ($delivery->message_contact_id !== null && ($contact === null || ! $contact->isActive())) {
            return self::skip($delivery, 'Opted out before it was sent.');
        }

        $template = $delivery->template;

        if ($template === null) {
            return self::skip($delivery, 'The template was deleted before it was sent.');
        }

        if (! $template->sendable()) {
            return self::skip($delivery, 'The template is not approved.');
        }

        $channel = $delivery->channel;
        $provider = $channel->current();

        if ($provider === null || ! $provider->isAvailable() || ! $provider->client()->configured()) {
            return self::skip($delivery, 'The channel was switched off or is not configured.');
        }

        try {
            $id = $provider->client()->send(new OutgoingMessage(
                $delivery->address,
                $template,
                (array) ($delivery->vars ?? []),
                route('api.v1.messaging.webhook', ['channel' => $channel->value, 'provider' => $provider->id()]),
            ));
        } catch (ProviderException $e) {
            $delivery->update(['status' => MessageDeliveryStatus::Failed, 'provider' => $provider->id(), 'error' => mb_substr($e->getMessage(), 0, 490)]);

            if ($e->revoke && $contact !== null) {
                Contacts::optOut($channel, $contact->address, 'unregistered');
            }

            if ($e->config) {
                Setting::put($channel->errorKey(), $e->getMessage().' ('.now()->toDayDateTimeString().')');
            }

            return self::FAILED;
        } catch (\Throwable $e) {
            $delivery->update(['status' => MessageDeliveryStatus::Failed, 'provider' => $provider->id(), 'error' => mb_substr($e->getMessage(), 0, 490)]);

            return self::FAILED;
        }

        $delivery->update([
            'status' => MessageDeliveryStatus::Sent,
            'provider' => $provider->id(),
            'provider_message_id' => $id !== '' ? mb_substr($id, 0, 190) : null,
            'sent_at' => now(),
            'error' => null,
        ]);

        $contact?->forceFill(['last_sent_at' => now()])->save();

        if (filled(Setting::get($channel->errorKey()))) {
            Setting::put($channel->errorKey(), null);
        }

        return self::SENT;
    }

    private static function skip(MessageDelivery $delivery, string $reason): string
    {
        $delivery->update(['status' => MessageDeliveryStatus::Skipped, 'error' => $reason]);

        return self::SKIPPED;
    }
}
