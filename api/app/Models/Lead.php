<?php

namespace App\Models;

use App\Enums\LeadStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * One enquiry, as something to be worked rather than something that arrived.
 *
 * See the migration for why this is its own table and not columns bolted onto
 * `enquiries`. The short version: two intakes with incompatible shapes, and a
 * submission is evidence while a lead is a working record.
 */
class Lead extends Model
{
    protected $fillable = [
        'source_type', 'source_id', 'channel', 'form_name',
        'name', 'email', 'phone', 'company', 'subject', 'message',
        'source_url', 'source_path', 'source_title', 'referrer',
        'utm_source', 'utm_medium', 'utm_campaign',
        'status', 'assigned_to', 'follow_up_at', 'value_paise',
        'contacted_at', 'closed_at',
        'score', 'score_band', 'score_reasons', 'ip_address',
    ];

    protected function casts(): array
    {
        return [
            'status' => LeadStatus::class,
            'score_reasons' => 'array',
            'follow_up_at' => 'datetime',
            'contacted_at' => 'datetime',
            'closed_at' => 'datetime',
        ];
    }

    /** The enquiry or form submission this was made from, where it still exists. */
    public function source(): MorphTo
    {
        return $this->morphTo();
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function notes(): HasMany
    {
        return $this->hasMany(LeadNote::class)->orderBy('created_at');
    }

    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereIn('status', array_column(LeadStatus::openStates(), 'value'));
    }

    /**
     * Wanted a reply by a date that has passed.
     *
     * Only ever asked of open leads: a won deal with a follow-up date left on
     * it is not overdue, it is finished, and a queue that says otherwise is one
     * people stop believing.
     */
    public function scopeOverdue(Builder $query): Builder
    {
        return $query->open()->whereNotNull('follow_up_at')->where('follow_up_at', '<=', now());
    }

    /**
     * Everything else this address has sent.
     *
     * Computed, never counted into a column. A stored count is wrong from the
     * next submission onwards and nobody notices, which is the same argument
     * `menu_items` makes for resolving a URL rather than storing one.
     */
    public function siblings(): Builder
    {
        return static::query()
            ->whereKeyNot($this->getKey())
            ->whereNotNull('email')
            // Plain equality: the column collation is `utf8mb4_unicode_ci`, so
            // this already matches case-insensitively, and wrapping the column
            // in `LOWER()` only hides the index from the planner.
            ->where('email', $this->email)
            ->latest();
    }
}
