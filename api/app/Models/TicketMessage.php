<?php

namespace App\Models;

use App\Enums\WebhookEvent;
use App\Support\Webhooks\WebhookPayload;
use App\Support\Webhooks\Webhooks;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Log;

/**
 * One message on a ticket, from either side.
 *
 * **A sensitive message is stored encrypted** (`is_sensitive`, 2026-09-21):
 * the switch under the reply box on both the portal and the console. The
 * body of a switched-on row is sealed with `Crypt` in `saving`, and the
 * `body` accessor opens it again, so every reader — the two resources, the
 * notification, the piper's read-modify-write — sees the plain text and
 * nothing has to know. Two consequences are deliberate and are the point:
 * the `TicketReplied` email carries a sentence instead of the excerpt, and
 * no `ticket.replied` webhook is emitted at all (the payload is written to
 * `webhook_deliveries` in clear and shown on the delivery screen, so
 * redacting one field is not enough).
 *
 * The Setting pattern rather than an `encrypted` cast, because only some
 * rows are secret and a cast applies to the column. A row that will not
 * decrypt — APP_KEY changed, the same trade `DigitalCode` documents —
 * answers `UNREADABLE` and a warning in the log rather than a 500 on the
 * whole thread.
 */
class TicketMessage extends Model
{
    /** What a sensitive body reads as when it cannot be decrypted. */
    public const UNREADABLE = 'This message could not be decrypted.';

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
        static::saving(fn (self $message) => $message->sealBody());

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
     * The body as written. The stored value is ciphertext for a sensitive
     * row once it has been saved, and plain text until then (the setter
     * stores what it is given; `sealBody()` encrypts on the way to the
     * table), so the getter opens only what is actually sealed.
     *
     * @return Attribute<string|null, string|null>
     */
    protected function body(): Attribute
    {
        return Attribute::make(
            get: function (?string $stored): ?string {
                if ($stored === null || ! $this->is_sensitive || ! self::isSealed($stored)) {
                    return $stored;
                }

                try {
                    return Crypt::decryptString($stored);
                } catch (\Throwable) {
                    Log::warning('Could not decrypt a sensitive ticket message', ['ticket_message_id' => $this->id]);

                    return self::UNREADABLE;
                }
            },
            set: fn (?string $value): ?string => $value,
        )->withoutObjectCaching();
        // Without that, Eloquent keeps the value the setter was handed and
        // re-applies the setter on save — which put the plain text back over
        // the ciphertext `sealBody()` had just written. Measured.
    }

    /** Seal the body of a sensitive row before it is written, unless it already is. */
    public function sealBody(): void
    {
        $stored = $this->attributes['body'] ?? null;

        if ($this->is_sensitive && is_string($stored) && $stored !== '' && ! self::isSealed($stored)) {
            $this->attributes['body'] = Crypt::encryptString($stored);
        }
    }

    /**
     * Whether a stored value is Laravel's ciphertext envelope — base64 of a
     * JSON object carrying `iv`, `value` and `mac`. A message somebody typed
     * that happens to be exactly that is not a case worth a column.
     */
    public static function isSealed(string $stored): bool
    {
        $decoded = base64_decode($stored, true);
        if ($decoded === false) {
            return false;
        }

        $json = json_decode($decoded, true);

        return is_array($json) && isset($json['iv'], $json['value'], $json['mac']);
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
