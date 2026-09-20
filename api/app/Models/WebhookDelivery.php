<?php

namespace App\Models;

use App\Enums\WebhookEvent;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One attempt-series at telling one hook about one event.
 *
 * The payload is stored here, on the row, rather than rebuilt from the record
 * at send time: a retry an hour later and a redelivery a week later both send
 * what the event *said*, not what the ticket has since become. The row is also
 * the unit of retry — `DeliverWebhook` carries only its id.
 */
class WebhookDelivery extends Model
{
    public const PENDING = 'pending';

    public const DELIVERED = 'delivered';

    public const FAILED = 'failed';

    public const STATUSES = [self::PENDING, self::DELIVERED, self::FAILED];

    protected $fillable = [
        'webhook_id', 'event', 'payload', 'status', 'attempts',
        'response_status', 'response_excerpt', 'next_attempt_at', 'delivered_at',
    ];

    protected $attributes = ['status' => self::PENDING, 'attempts' => 0];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'attempts' => 'integer',
            'response_status' => 'integer',
            'next_attempt_at' => 'datetime',
            'delivered_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Webhook, $this> */
    public function webhook(): BelongsTo
    {
        return $this->belongsTo(Webhook::class);
    }

    public function event(): ?WebhookEvent
    {
        return WebhookEvent::tryFrom($this->event);
    }

    /**
     * The envelope exactly as it is sent.
     *
     * `id` and `created_at` are the delivery's own, so a receiver can dedupe
     * on the id and a redelivery — a fresh row — is a fresh id. The bytes are
     * produced once here, sent as-is and signed as-is; a receiver verifying
     * over its own re-encoding of the JSON is the mismatch every webhook
     * consumer hits first, and the docs say so.
     */
    public function envelope(): string
    {
        return (string) json_encode([
            'id' => $this->id,
            'event' => $this->event,
            'created_at' => $this->created_at?->toIso8601String(),
            'data' => $this->payload,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }
}
