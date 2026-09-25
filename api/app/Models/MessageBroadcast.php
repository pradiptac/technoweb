<?php

namespace App\Models;

use App\Enums\BroadcastAudience;
use App\Enums\BroadcastStatus;
use App\Enums\MessageChannel;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A one-off send of one template to an audience on one channel.
 *
 * The audience is frozen into `message_deliveries` rows when it is queued,
 * so the report describes what was attempted rather than who would match
 * today. Always promotional: a broadcast goes out only inside the
 * quiet-hours window.
 */
class MessageBroadcast extends Model
{
    protected $fillable = [
        'name', 'channel', 'message_template_id', 'audience', 'newsletter_group_id', 'store_product_id',
        'status', 'scheduled_at', 'started_at', 'completed_at', 'recipient_count', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'channel' => MessageChannel::class,
            'audience' => BroadcastAudience::class,
            'status' => BroadcastStatus::class,
            'scheduled_at' => 'datetime',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
            'recipient_count' => 'integer',
        ];
    }

    /** @return BelongsTo<MessageTemplate, $this> */
    public function template(): BelongsTo
    {
        return $this->belongsTo(MessageTemplate::class, 'message_template_id');
    }

    /** @return BelongsTo<NewsletterGroup, $this> */
    public function group(): BelongsTo
    {
        return $this->belongsTo(NewsletterGroup::class, 'newsletter_group_id');
    }

    /** @return HasMany<MessageDelivery, $this> */
    public function deliveries(): HasMany
    {
        return $this->hasMany(MessageDelivery::class);
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
