<?php

namespace App\Enums;

/**
 * What an outgoing webhook can be told about.
 *
 * The list is the contract with whoever is listening, so a case is renamed
 * as carefully as a URL: the value is what travels in `X-Technoware-Event`
 * and in every stored `events` list, and a hook subscribed to a name that
 * stops existing is a hook that silently hears nothing.
 *
 * `ping` is the one event nothing on the site emits — it comes only from the
 * console's "Send a ping" button, so a new endpoint can be proved before a
 * real order depends on it. It is not offered as a subscription.
 */
enum WebhookEvent: string
{
    case Ping = 'ping';
    case LeadCreated = 'lead.created';
    case TicketCreated = 'ticket.created';
    case TicketReplied = 'ticket.replied';
    case TicketStatusChanged = 'ticket.status_changed';
    case OrderPlaced = 'order.placed';
    case OrderPaid = 'order.paid';
    case OrderStatusChanged = 'order.status_changed';
    case CustomerRegistered = 'customer.registered';
    case FormSubmitted = 'form.submitted';
    case SubscriberJoined = 'subscriber.joined';
    case VisitRequested = 'visit.requested';
    case MeetingScheduled = 'meeting.scheduled';
    case MeetingRescheduled = 'meeting.rescheduled';
    case MeetingCancelled = 'meeting.cancelled';

    public function label(): string
    {
        return match ($this) {
            self::Ping => 'Ping',
            self::LeadCreated => 'A lead arrived',
            self::TicketCreated => 'A ticket was opened',
            self::TicketReplied => 'A ticket was replied to',
            self::TicketStatusChanged => 'A ticket changed status',
            self::OrderPlaced => 'An order was placed',
            self::OrderPaid => 'An order was paid',
            self::OrderStatusChanged => 'An order changed status',
            self::CustomerRegistered => 'A customer confirmed their address',
            self::FormSubmitted => 'A form was submitted',
            self::SubscriberJoined => 'A newsletter subscriber joined',
            self::VisitRequested => 'An engineer visit was requested',
            self::MeetingScheduled => 'An online meeting was booked',
            self::MeetingRescheduled => 'An online meeting was moved',
            self::MeetingCancelled => 'An online meeting was cancelled',
        };
    }

    /** A sentence for the console's checkbox, saying what the payload is. */
    public function blurb(): string
    {
        return match ($this) {
            self::Ping => 'Sent from the console only, to prove the endpoint.',
            self::LeadCreated => 'Every enquiry, editor-built form and chatbot callback, as the lead it became.',
            self::TicketCreated => 'A new support ticket, from the portal or the mailbox.',
            self::TicketReplied => 'A customer-visible message from either side. Never an internal note.',
            self::TicketStatusChanged => 'The ticket, with the status it moved from and to.',
            self::OrderPlaced => 'The order as placed, before any payment.',
            self::OrderPaid => 'The moment an order is paid — by the gateway or recorded by hand.',
            self::OrderStatusChanged => 'The order, with the status it moved from and to.',
            self::CustomerRegistered => 'A portal account whose address has just been confirmed.',
            self::FormSubmitted => 'The raw answers to an editor-built form.',
            self::SubscriberJoined => 'A newsletter subscriber row being created, however it arrived.',
            self::VisitRequested => 'A site visit request, with the times asked for. Never the access token.',
            self::MeetingScheduled => 'A meeting booked from the site, the portal or the console, with its time, host and Meet link. Never the access token or the staff note.',
            self::MeetingRescheduled => 'A meeting moved to a new time or host, with the time it moved from.',
            self::MeetingCancelled => 'A cancelled meeting, with the reason when the desk gave one.',
        };
    }

    /** Whether a hook may subscribe to it. `ping` is sent, never subscribed to. */
    public function subscribable(): bool
    {
        return $this !== self::Ping;
    }

    /**
     * The subscribable events, for the console's checkboxes and for
     * validation — one list, sent by the API rather than spelled out in
     * TypeScript.
     *
     * @return array<int, array{value: string, label: string, blurb: string}>
     */
    public static function options(): array
    {
        return array_values(array_map(
            fn (self $c) => ['value' => $c->value, 'label' => $c->label(), 'blurb' => $c->blurb()],
            array_filter(self::cases(), fn (self $c) => $c->subscribable()),
        ));
    }

    /** @return array<int, string> */
    public static function subscribableValues(): array
    {
        return array_map(fn (array $o) => $o['value'], self::options());
    }
}
