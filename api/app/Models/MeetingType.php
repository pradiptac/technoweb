<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A kind of online meeting a customer can book — "Product demo, 30 minutes"
 * (2026-09-29, docs/meetings.md).
 *
 * `hosts` are the staff allowed to take it. An empty list means every
 * eligible host; a non-empty list whose hosts are no longer eligible means
 * **no** host, never every host — a type restricted to two people must not
 * open to the whole desk because both left.
 *
 * A type that has meetings cannot be deleted (the foreign key restricts
 * it); switching it off hides it from booking and leaves its meetings alone.
 * The buffers widen a *new* meeting's block; an existing meeting's block is
 * stored on the meeting and never moves when a type changes.
 */
class MeetingType extends Model
{
    protected $fillable = [
        'name', 'slug', 'description', 'minutes', 'buffer_before', 'buffer_after',
        'is_public', 'is_active', 'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'minutes' => 'integer',
            'buffer_before' => 'integer',
            'buffer_after' => 'integer',
            'is_public' => 'boolean',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    /** @param  Builder<MeetingType>  $query */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    /**
     * What the public page offers: switched on and public.
     *
     * @param  Builder<MeetingType>  $query
     */
    public function scopeBookable(Builder $query): Builder
    {
        return $query->where('is_active', true)->where('is_public', true);
    }

    /** @param  Builder<MeetingType>  $query */
    public function scopeOrdered(Builder $query): Builder
    {
        return $query->orderBy('sort_order')->orderBy('name')->orderBy('id');
    }

    /** @return BelongsToMany<User, $this> */
    public function hosts(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'meeting_type_user');
    }

    /** @return HasMany<Meeting, $this> */
    public function meetings(): HasMany
    {
        return $this->hasMany(Meeting::class);
    }
}
