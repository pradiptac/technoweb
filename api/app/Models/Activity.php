<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line of the activity log.
 *
 * **Append-only.** There is no update path, no delete endpoint and no admin
 * screen that offers either — a log the console can edit is not a log. The one
 * thing that removes rows is the scheduled retention prune, which deletes by
 * age and nothing else.
 */
class Activity extends Model
{
    protected $table = 'activity_log';

    /** Rows are written once and never touched, so there is no updated_at. */
    public const UPDATED_AT = null;

    protected $fillable = [
        'user_id', 'actor_name', 'actor_email', 'action',
        'subject_type', 'subject_id', 'subject_label', 'context', 'ip', 'user_agent',
    ];

    protected function casts(): array
    {
        return [
            'context' => 'array',
            'created_at' => 'datetime',
        ];
    }

    /** The staff account, while it still exists. */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function scopeAction(Builder $query, ?string $action): Builder
    {
        return $query->when($action, fn (Builder $q) => $q->where('action', $action));
    }

    public function scopeActor(Builder $query, ?int $userId): Builder
    {
        return $query->when($userId, fn (Builder $q) => $q->where('user_id', $userId));
    }

    /**
     * Searches the denormalised copies, not the joined account.
     *
     * Looking for what somebody did after they left is one of the main reasons
     * to open this screen, and a join would have lost them.
     */
    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        return $query->when($term, function (Builder $q) use ($term) {
            $like = '%'.$term.'%';
            $q->where(fn (Builder $inner) => $inner
                ->where('actor_name', 'like', $like)
                ->orWhere('actor_email', 'like', $like)
                ->orWhere('subject_label', 'like', $like)
                ->orWhere('action', 'like', $like));
        });
    }
}
