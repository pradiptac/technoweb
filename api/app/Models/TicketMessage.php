<?php

namespace App\Models;

use App\Enums\WebhookEvent;
use App\Models\Concerns\SealsSensitiveText;
use App\Support\Webhooks\WebhookPayload;
use App\Support\Webhooks\Webhooks;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * One message on a ticket, from either side.
 *
 * **A sensitive message is stored encrypted** (`is_sensitive`, 2026-09-21):
 * the switch under the reply box on both the portal and the console. The
 * body of a switched-on row is sealed in `saving` and opened by the `body`
 * accessor — `SealsSensitiveText`, shared with the ticket's description —
 * so every reader sees the plain text and nothing has to know. Two
 * consequences are deliberate and are the point: the `TicketReplied` email
 * carries a sentence instead of the excerpt, and no `ticket.replied`
 * webhook is emitted at all (the payload is written to `webhook_deliveries`
 * in clear and shown on the delivery screen, so redacting one field is not
 * enough — and a message *is* its body, so there is nothing left to send;
 * a ticket's payload is redacted instead, because "a ticket exists" is what
 * the integration is told).
 */
class TicketMessage extends Model
{
    use SealsSensitiveText;

    protected $fillable = ['ticket_id', 'author_type', 'author_id', 'body', 'is_internal', 'is_sensitive', 'channel'];

    protected function casts(): array
    {
        return [
            'is_internal' => 'boolean',
            'is_sensitive' => 'boolean',
            'rating' => 'integer',
            'rated_at' => 'datetime',
            'reported_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::saving(fn (self $message) => $message->sealSensitive('body'));

        /*
         * `ticket.replied` for a customer-visible message from either side.
         * An internal note is refused here, at the source, so no emitter has
         * to remember: the worst failure the ticket module can have is an
         * engineering note reaching a customer, and a webhook is one more
         * inbox. A sensitive message is refused for the same reason: the
         * delivery row holds the payload in clear.
         */
        static::created(function (self $message) {
            if (! $message->is_internal && ! $message->is_sensitive) {
                Webhooks::emit(WebhookEvent::TicketReplied, fn () => WebhookPayload::ticketMessage($message));
            }
        });
    }

    /**
     * The body as written: sealed on the way to the table, opened here. The
     * setter stores what it is given, so a row is plain text between
     * `make()` and `save()` and the getter opens only what is actually
     * sealed. `withoutObjectCaching()` is load-bearing — see the trait.
     *
     * @return Attribute<string|null, string|null>
     */
    protected function body(): Attribute
    {
        return Attribute::make(
            get: fn (?string $stored): ?string => $this->openSensitive('body', $stored),
            set: fn (?string $value): ?string => $value,
        )->withoutObjectCaching();
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
