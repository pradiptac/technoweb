<?php

namespace App\Models;

use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Enums\WebhookEvent;
use App\Models\Concerns\SealsSensitiveText;
use App\Support\Webhooks\WebhookPayload;
use App\Support\Webhooks\Webhooks;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Ticket extends Model
{
    use SealsSensitiveText;

    protected $fillable = [
        'reference', 'customer_id', 'ticket_category_id', 'assigned_to', 'merged_into_id',
        'subject', 'description', 'is_sensitive', 'status', 'priority', 'channel',
        'first_responded_at', 'resolved_at', 'closed_at', 'due_at',
    ];

    protected function casts(): array
    {
        return [
            'is_sensitive' => 'boolean',
            'status' => TicketStatus::class,
            'priority' => TicketPriority::class,
            'first_responded_at' => 'datetime',
            'resolved_at' => 'datetime',
            'closed_at' => 'datetime',
            'due_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        // The opening description of a ticket marked sensitive is sealed the
        // way a message's body is — `SealsSensitiveText`, opened by the
        // accessor below. The subject is not: it is the line every list,
        // email subject and webhook names the ticket by.
        static::saving(fn (self $ticket) => $ticket->sealSensitive('description'));

        static::creating(function (self $ticket) {
            $ticket->reference ??= self::nextReference();

            // SLA clock starts at creation: category override, else priority default.
            $hours = $ticket->category?->default_sla_hours
                ?? ($ticket->priority ?? TicketPriority::Normal)->slaHours();

            $ticket->due_at ??= now()->addHours($hours);
        });

        /*
         * Outgoing webhooks, from the model's own state changes rather than
         * from the three controllers and the mailbox piper that produce them
         * — one place, and a door added later is covered. `Webhooks::emit`
         * never throws; the delivery row rides in whatever transaction this
         * save is in and the job is dispatched after it commits.
         */
        static::created(function (self $ticket) {
            Webhooks::emit(WebhookEvent::TicketCreated, fn () => WebhookPayload::ticket($ticket));
        });

        static::updated(function (self $ticket) {
            if (! $ticket->wasChanged('status')) {
                return;
            }

            $from = $ticket->getOriginal('status');

            Webhooks::emit(WebhookEvent::TicketStatusChanged, fn () => WebhookPayload::ticketWith($ticket, [
                'from' => $from instanceof TicketStatus ? $from->value : $from,
                'to' => $ticket->status->value,
            ]));
        });
    }

    /**
     * The description as written — see `SealsSensitiveText`; `withoutObjectCaching()` is load-bearing.
     *
     * @return Attribute<string|null, string|null>
     */
    protected function description(): Attribute
    {
        return Attribute::make(
            get: fn (?string $stored): ?string => $this->openSensitive('description', $stored),
            set: fn (?string $value): ?string => $value,
        )->withoutObjectCaching();
    }

    /**
     * Human-readable, non-guessable-ish reference. Sequential within a year so
     * staff can sort by eye: TW-2026-04821.
     */
    /*
     * Concurrent inserts could in theory pick the same number; the unique index
     * on `reference` turns that into a failed insert rather than a duplicate.
     * Wrap in a retry if the support desk ever gets busy enough to notice.
     */
    public static function nextReference(): string
    {
        $year = now()->year;
        $last = self::withoutGlobalScopes()
            ->where('reference', 'like', "TW-{$year}-%")
            ->orderByDesc('id')
            ->value('reference');

        $n = $last ? ((int) Str::afterLast($last, '-')) + 1 : 1;

        return sprintf('TW-%d-%05d', $year, $n);
    }

    public function getRouteKeyName(): string
    {
        return 'reference';
    }

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** @return BelongsTo<TicketCategory, $this> */
    public function category(): BelongsTo
    {
        return $this->belongsTo(TicketCategory::class, 'ticket_category_id');
    }

    /** @return BelongsTo<User, $this> */
    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    /**
     * Where this ticket's conversation went, when it was merged into another.
     *
     * Set once, on the source, and never cleared: a merged ticket is closed
     * for good, and the screens link here rather than offering a reply box
     * on a thread with nothing left in it.
     *
     * @return BelongsTo<Ticket, $this>
     */
    public function mergedInto(): BelongsTo
    {
        return $this->belongsTo(Ticket::class, 'merged_into_id');
    }

    public function isMerged(): bool
    {
        return $this->merged_into_id !== null;
    }

    /** @return HasMany<TicketMessage, $this> */
    public function messages(): HasMany
    {
        return $this->hasMany(TicketMessage::class)->orderBy('created_at');
    }

    /** Messages a customer is allowed to see — internal notes excluded. */
    public function publicMessages(): HasMany
    {
        return $this->messages()->where('is_internal', false);
    }

    /** @return HasMany<TicketAttachment, $this> */
    public function attachments(): HasMany
    {
        return $this->hasMany(TicketAttachment::class);
    }

    /** @return HasMany<TicketEvent, $this> */
    public function events(): HasMany
    {
        return $this->hasMany(TicketEvent::class)->orderBy('created_at');
    }

    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereIn('status', array_map(fn (TicketStatus $s) => $s->value, TicketStatus::openStates()));
    }

    public function scopeOverdue(Builder $query): Builder
    {
        return $query->open()->whereNotNull('due_at')->where('due_at', '<', now());
    }

    /** Tickets on which the customer has reported a reply — the queue's `?reported=1`. */
    public function scopeReported(Builder $query): Builder
    {
        return $query->whereHas('messages', fn (Builder $m) => $m->whereNotNull('reported_at'));
    }

    public function isOverdue(): bool
    {
        return $this->status->isOpen() && $this->due_at && $this->due_at->isPast();
    }

    /** Record a status/assignment change on the audit trail. */
    public function logEvent(string $type, ?string $from, ?string $to, ?int $userId = null): TicketEvent
    {
        return $this->events()->create([
            'type' => $type,
            'from_value' => $from,
            'to_value' => $to,
            'user_id' => $userId,
        ]);
    }
}
