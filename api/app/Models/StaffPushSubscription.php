<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A staff member's browser. Never a `message_contacts` row: an alert is not a broadcast audience. */
class StaffPushSubscription extends Model
{
    protected $fillable = ['user_id', 'token', 'label', 'last_seen_at', 'failed_at'];

    protected $hidden = ['token'];

    protected function casts(): array
    {
        return ['last_seen_at' => 'datetime', 'failed_at' => 'datetime'];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
