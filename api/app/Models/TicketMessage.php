<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class TicketMessage extends Model
{
    protected $fillable = ['ticket_id', 'author_type', 'author_id', 'body', 'is_internal'];

    protected function casts(): array
    {
        return ['is_internal' => 'boolean', 'rating' => 'integer', 'rated_at' => 'datetime', 'reported_at' => 'datetime'];
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

    public function ticket(): BelongsTo
    {
        return $this->belongsTo(Ticket::class);
    }

    public function author(): MorphTo
    {
        return $this->morphTo();
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(TicketAttachment::class);
    }

    public function authorIsCustomer(): bool
    {
        return $this->author instanceof Customer;
    }
}
