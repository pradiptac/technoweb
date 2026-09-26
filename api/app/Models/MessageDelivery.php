<?php

namespace App\Models;

use App\Enums\MessageChannel;
use App\Enums\MessageDeliveryStatus;
use App\Enums\MessageEvent;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One message to one contact on one channel — from an event (`event` set)
 * or a broadcast (`message_broadcast_id` set).
 *
 * `vars` is what the template is filled with, stored so the worker renders
 * what the fire point knew at the time rather than re-deriving it later.
 * The address is copied from the contact, so a report still says where a
 * message went after the contact row is gone.
 */
class MessageDelivery extends Model
{
    protected $fillable = [
        'channel', 'provider', 'event', 'message_broadcast_id', 'message_template_id', 'message_contact_id',
        'address', 'vars', 'status', 'provider_message_id', 'error', 'sent_at', 'delivered_at', 'read_at',
    ];

    protected function casts(): array
    {
        return [
            'channel' => MessageChannel::class,
            'event' => MessageEvent::class,
            'status' => MessageDeliveryStatus::class,
            'vars' => 'array',
            'sent_at' => 'datetime',
            'delivered_at' => 'datetime',
            'read_at' => 'datetime',
        ];
    }

    /** Whether the worker should hold this until the quiet-hours window opens. */
    public function isPromotional(): bool
    {
        return $this->message_broadcast_id !== null || ($this->event?->promotional() ?? false);
    }

    /** @return BelongsTo<MessageTemplate, $this> */
    public function template(): BelongsTo
    {
        return $this->belongsTo(MessageTemplate::class, 'message_template_id');
    }

    /** @return BelongsTo<MessageContact, $this> */
    public function contact(): BelongsTo
    {
        return $this->belongsTo(MessageContact::class, 'message_contact_id');
    }

    /** @return BelongsTo<MessageBroadcast, $this> */
    public function broadcast(): BelongsTo
    {
        return $this->belongsTo(MessageBroadcast::class, 'message_broadcast_id');
    }
}
