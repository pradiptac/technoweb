<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A stretch when a host takes no meetings — leave, a training day, an
 * afternoon at a customer's site. Subtracted from their hours by the slot
 * engine. In the morph map as `meeting_time_off`, because an admin route
 * binds it and the activity log names what a DELETE was aimed at.
 */
class MeetingTimeOff extends Model
{
    protected $table = 'meeting_host_time_off';

    protected $fillable = ['user_id', 'starts_at', 'ends_at', 'note'];

    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
