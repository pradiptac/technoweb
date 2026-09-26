<?php

namespace App\Models;

use App\Enums\MessageChannel;
use App\Enums\MessageEvent;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One cell of the automations table: an event on a channel, the template
 * said there, and whether it is switched on. Unique per (event, channel), so
 * an event is said once per channel.
 */
class MessageAutomation extends Model
{
    protected $fillable = ['event', 'channel', 'message_template_id', 'is_enabled'];

    protected function casts(): array
    {
        return [
            'event' => MessageEvent::class,
            'channel' => MessageChannel::class,
            'is_enabled' => 'boolean',
        ];
    }

    /** @return BelongsTo<MessageTemplate, $this> */
    public function template(): BelongsTo
    {
        return $this->belongsTo(MessageTemplate::class, 'message_template_id');
    }
}
