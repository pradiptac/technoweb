<?php

namespace App\Models;

use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Ticket extends Model
{
    protected $fillable = [
        'reference', 'customer_id', 'ticket_category_id', 'assigned_to',
        'subject', 'description', 'status', 'priority',
        'first_responded_at', 'resolved_at', 'closed_at', 'due_at',
    ];

    protected function casts(): array
    {
        return [
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
        static::creating(function (self $ticket) {
            $ticket->reference ??= self::nextReference();

            // SLA clock starts at creation: category override, else priority default.
            $hours = $ticket->category?->default_sla_hours
                ?? ($ticket->priority ?? TicketPriority::Normal)->slaHours();

            $ticket->due_at ??= now()->addHours($hours);
        });
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

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(TicketCategory::class, 'ticket_category_id');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(TicketMessage::class)->orderBy('created_at');
    }

    /** Messages a customer is allowed to see — internal notes excluded. */
    public function publicMessages(): HasMany
    {
        return $this->messages()->where('is_internal', false);
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(TicketAttachment::class);
    }

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
