<?php

namespace App\Models;

use App\Enums\SocialNetwork;
use App\Enums\SocialPostStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * A draft of a LinkedIn or X post about a published record. The subject is a
 * morph so four kinds share one table; the aliases are
 * `App\Support\Social\SocialSubjects::ALIASES`.
 */
class SocialPost extends Model
{
    protected $fillable = [
        'network', 'status', 'subject_type', 'subject_id', 'text', 'url', 'source', 'ai_pending',
        'drafted_by', 'approved_by', 'approved_at', 'sent_at', 'remote_id', 'remote_url', 'error',
    ];

    protected $attributes = ['ai_pending' => false];

    protected function casts(): array
    {
        return [
            'network' => SocialNetwork::class,
            'status' => SocialPostStatus::class,
            'ai_pending' => 'boolean',
            'approved_at' => 'datetime',
            'sent_at' => 'datetime',
        ];
    }

    /** @return MorphTo<Model, $this> */
    public function subject(): MorphTo
    {
        return $this->morphTo('subject');
    }

    /** @return BelongsTo<User, $this> */
    public function drafter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'drafted_by');
    }

    /** @return BelongsTo<User, $this> */
    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
