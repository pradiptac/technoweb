<?php

namespace App\Enums;

/**
 * A campaign's lifecycle.
 *
 * A PHP enum rather than a lookup table, the call `TicketStatus` already
 * documents: these are states the application branches on, and a new row in a
 * table could not introduce one without code to handle it.
 */
enum CampaignStatus: string
{
    case Draft = 'draft';
    case Ready = 'ready';
    case Scheduled = 'scheduled';
    case Sending = 'sending';
    case Sent = 'sent';
    case Paused = 'paused';
    case Cancelled = 'cancelled';
    case Failed = 'failed';

    public function label(): string
    {
        return match ($this) {
            self::Draft => 'Draft',
            self::Ready => 'Ready to send',
            self::Scheduled => 'Scheduled',
            self::Sending => 'Sending',
            self::Sent => 'Sent',
            self::Paused => 'Paused',
            self::Cancelled => 'Cancelled',
            self::Failed => 'Failed',
        };
    }

    /** Still editable. Once a message has gone out, it cannot be unsent. */
    public function isEditable(): bool
    {
        return in_array($this, [self::Draft, self::Ready, self::Scheduled, self::Paused], true);
    }

    /**
     * Has this campaign already been handed to the queue?
     *
     * The guard against the worst mistake in the module: sending twice. A
     * campaign that has started is never re-queued, however the endpoint is
     * called — a double-click, a retried request, a second tab.
     */
    public function hasStarted(): bool
    {
        return in_array($this, [self::Sending, self::Sent], true);
    }

    public static function options(): array
    {
        return array_map(fn (self $c) => ['value' => $c->value, 'label' => $c->label()], self::cases());
    }
}
