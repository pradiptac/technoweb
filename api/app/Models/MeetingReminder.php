<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A reminder owed, or sent, for one start time of one meeting.
 *
 * Claimed by inserting the row: the unique key on `(meeting_id,
 * offset_minutes, starts_at)` means two runs cannot both send the same
 * reminder, and a rescheduled meeting — a new `starts_at` — owes new rows
 * without anything being deleted. An offset already past when the meeting
 * was booked is written with `sent_at` set, so nothing arrives late.
 */
class MeetingReminder extends Model
{
    protected $fillable = ['meeting_id', 'offset_minutes', 'starts_at', 'sent_at'];

    protected function casts(): array
    {
        return [
            'offset_minutes' => 'integer',
            'starts_at' => 'datetime',
            'sent_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Meeting, $this> */
    public function meeting(): BelongsTo
    {
        return $this->belongsTo(Meeting::class);
    }
}
