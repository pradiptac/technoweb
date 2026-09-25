<?php

namespace App\Support\Messaging;

use App\Enums\MessageEvent;

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
 * Until the messaging module is built this is the contract and a no-op, so
 * the basket and wishlist work can call it from day one.
 */
final class Messenger
{
    /**
     * @param  array<string, scalar|null>  $vars  placeholder values, see MessageEvent::placeholders()
     */
    public static function notify(MessageEvent $event, MessageRecipient $to, array $vars = []): void
    {
        // Implemented by the messaging module.
    }
}
