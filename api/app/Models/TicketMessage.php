<?php

namespace App\Models;

use App\Enums\WebhookEvent;
use App\Support\Webhooks\WebhookPayload;
use App\Support\Webhooks\Webhooks;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class TicketMessage extends Model
{
    protected $fillable = ['ticket_id', 'author_type', 'author_id', 'body', 'is_internal', 'channel'];

    protected function casts(): array
    {
        return ['is_internal' => 'boolean', 'rating' => 'integer', 'rated_at' => 'datetime', 'reported_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        /*
         * `ticket.replied` for a customer-visible message from either side.
         * An internal note is refused here, at the source, so no emitter has
         * to remember: the worst failure the ticket module can have is an
         * engineering note reaching a customer, and a webhook is one more
         * inbox.
         */
        static::created(function (self $message) {
            if (! $message->is_internal) {
                Webhooks::emit(WebhookEvent::TicketReplied, fn () => WebhookPayload::ticketMessage($message));
            }
        });
    }

    /**
     * What a customer may rate or report: a staff reply they can see. Their
     * own messages and internal notes are refused with a 404 rather than a
     * 422 — a note's existence is not something the customer endpoint
     * confirms, which is the rule `publicMessages` already keeps.
     */
    public function isRateable(): bool
    {
        return ! $this->is_internal && ! $this->authorIsCustomer();
    }

    /** @return BelongsTo<Ticket, $this> */
    public function ticket(): BelongsTo
    {
        return $this->belongsTo(Ticket::class);
    }

    /** @return MorphTo<Model, $this> */
    public function author(): MorphTo
    {
        return $this->morphTo();
    }

    /** @return HasMany<TicketAttachment, $this> */
    public function attachments(): HasMany
    {
        return $this->hasMany(TicketAttachment::class);
    }

    public function authorIsCustomer(): bool
    {
        return $this->author instanceof Customer;
    }
}
