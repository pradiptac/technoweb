<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One certification a team member holds — CCNA, NSE 4, and so on.
 *
 * A child of the member, replaced wholesale when the member is saved, like
 * a slider's slides. Never bound in a route and never logged, so it is not
 * in the morph map; `Slide` is the precedent.
 */
class TeamMemberCertification extends Model
{
    protected $fillable = [
        'team_member_id', 'name', 'issuer', 'credential_id',
        'issued_on', 'expires_on', 'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'issued_on' => 'date',
            'expires_on' => 'date',
            'sort_order' => 'integer',
        ];
    }

    public function member(): BelongsTo
    {
        return $this->belongsTo(TeamMember::class, 'team_member_id');
    }

    /** Not lapsed. The public card drops a lapsed one; the member stays. */
    public function scopeCurrent(Builder $query): Builder
    {
        return $query->where(fn (Builder $q) => $q->whereNull('expires_on')->orWhereDate('expires_on', '>=', today()));
    }

    public function isExpired(): bool
    {
        return $this->expires_on !== null && $this->expires_on->isBefore(today());
    }
}
