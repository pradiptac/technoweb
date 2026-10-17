<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** The day's score and counts, for the trend (docs/health.md). */
class HealthSnapshot extends Model
{
    protected $fillable = ['date', 'score', 'records_checked', 'counts'];

    protected function casts(): array
    {
        return ['date' => 'date', 'counts' => 'array'];
    }
}
