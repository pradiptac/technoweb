<?php

namespace App\Models;

use App\Enums\SurveyRating;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The satisfaction survey a customer is emailed when a ticket is closed.
 * One per ticket. See the migration for why, and `App\Support\Tickets\Survey`
 * for when one is written.
 */
class TicketSurvey extends Model
{
    protected $fillable = ['ticket_id', 'token', 'sent_at', 'rating', 'comment', 'answered_at'];

    /** The token is a credential: never in an array or JSON form of the row. */
    protected $hidden = ['token'];

    protected function casts(): array
    {
        return [
            'sent_at' => 'datetime',
            'answered_at' => 'datetime',
            'rating' => 'integer',
        ];
    }

    /** @return BelongsTo<Ticket, $this> */
    public function ticket(): BelongsTo
    {
        return $this->belongsTo(Ticket::class);
    }

    public function isAnswered(): bool
    {
        return $this->rating !== null;
    }

    public function ratingCase(): ?SurveyRating
    {
        return $this->rating === null ? null : SurveyRating::tryFrom($this->rating);
    }
}
