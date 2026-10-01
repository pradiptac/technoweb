<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One stretch of a host's working week: an ISO weekday (1 is Monday) and a
 * start and end on the wall clock in `APP_TIMEZONE`.
 *
 * A day may have several rows — a split day around lunch. A host with no
 * rows at all works the default hours in the `meetings` settings group.
 */
class MeetingHostHour extends Model
{
    protected $fillable = ['user_id', 'weekday', 'start', 'end'];

    protected function casts(): array
    {
        return [
            'weekday' => 'integer',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
