<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Redirect extends Model
{
    protected $fillable = [
        'from_path', 'to_path', 'status_code', 'is_active',
        'created_automatically', 'hit_count', 'last_hit_at',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'created_automatically' => 'boolean',
            'last_hit_at' => 'datetime',
        ];
    }

    /**
     * One UPDATE, not two. `increment()` takes extra columns to write in the
     * same statement, and this runs on the read path of every redirect that
     * matches — a second `saveQuietly()` for the timestamp doubled it.
     */
    public function recordHit(): void
    {
        $this->increment('hit_count', 1, ['last_hit_at' => now()]);
    }
}
