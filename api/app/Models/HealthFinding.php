<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One problem on one record (docs/health.md). Replaced by `Findings::replace()`, never edited by hand. */
class HealthFinding extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'subject_type', 'subject_id', 'subject_published', 'check', 'severity', 'field', 'detail',
        'fingerprint', 'first_seen_at', 'last_seen_at', 'ignored_at', 'ignored_by',
    ];

    protected function casts(): array
    {
        return [
            'detail' => 'array',
            'subject_published' => 'boolean',
            'first_seen_at' => 'datetime',
            'last_seen_at' => 'datetime',
            'ignored_at' => 'datetime',
        ];
    }
}
