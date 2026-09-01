<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A line on a lead's trail — typed by somebody, or written by a status change.
 *
 * Both kinds live in one table so the detail screen shows one chronology. Two
 * tables would mean interleaving them at render time and getting the ordering
 * subtly wrong on the day two things happen in the same second.
 */
class LeadNote extends Model
{
    protected $fillable = ['lead_id', 'user_id', 'actor_name', 'kind', 'body', 'context'];

    protected function casts(): array
    {
        return ['context' => 'array'];
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
