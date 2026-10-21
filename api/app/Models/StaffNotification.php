<?php

namespace App\Models;

use App\Enums\StaffNotificationKind;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One line on a staff member's bell (C2, docs/notifications.md). */
class StaffNotification extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['user_id', 'kind', 'line', 'path', 'subject_type', 'subject_id', 'actor_id', 'actor_name', 'read_at'];

    protected function casts(): array
    {
        return ['kind' => StaffNotificationKind::class, 'read_at' => 'datetime'];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
