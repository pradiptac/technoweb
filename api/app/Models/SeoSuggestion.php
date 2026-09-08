<?php

namespace App\Models;

use App\Enums\SeoAiAction;
use App\Enums\SeoSuggestionStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * One thing the assistant proposed about one record.
 *
 * Append-only in practice: the only column that changes after the row is
 * written is `status` and the two that record who changed it. There is no
 * update path for `result` — a suggestion somebody could edit after the fact is
 * not evidence of what the model actually said, which is the same reason the
 * activity log has no write endpoint and chat messages set `UPDATED_AT = null`.
 */
class SeoSuggestion extends Model
{
    protected $fillable = [
        'seoable_type', 'seoable_id', 'action', 'model', 'status',
        'result', 'tokens', 'user_id', 'decided_by', 'decided_at',
    ];

    protected $casts = [
        'result' => 'array',
        'action' => SeoAiAction::class,
        'status' => SeoSuggestionStatus::class,
        'tokens' => 'integer',
        'decided_at' => 'datetime',
    ];

    /**
     * In-memory defaults matching the column defaults.
     *
     * A row created and asked about in the same breath would otherwise have a
     * null `status`, and the enum cast on null is null rather than `Pending` —
     * the defect `StoreProduct`'s booleans documented, where a variation created
     * and read back without a round trip called itself unsellable.
     */
    protected $attributes = [
        'status' => 'pending',
        'tokens' => 0,
    ];

    public function seoable(): MorphTo
    {
        return $this->morphTo();
    }

    /** Who asked for it. Null once that account is deleted. */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function decider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by');
    }

    public function scopeForRecord(Builder $query, Model $record): Builder
    {
        return $query
            ->where('seoable_type', $record->getMorphClass())
            ->where('seoable_id', $record->getKey());
    }
}
