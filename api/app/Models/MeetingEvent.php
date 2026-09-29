<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line in a meeting's trail — the `VisitEvent` shape.
 *
 * Append-only, so no `updated_at`. `user_id` is null for something the
 * customer or the system did. The meeting's trail is the record of moves,
 * cancellations and outcomes: the activity log records none of them (they
 * are neither a create nor a DELETE).
 */
class MeetingEvent extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['meeting_id', 'user_id', 'type', 'from_value', 'to_value', 'note'];

    /** @return BelongsTo<Meeting, $this> */
    public function meeting(): BelongsTo
    {
        return $this->belongsTo(Meeting::class);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
