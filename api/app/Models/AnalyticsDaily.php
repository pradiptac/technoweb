<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One day's rolled-up figure for a dimension and key, kept after the raw hits are pruned (C3). */
class AnalyticsDaily extends Model
{
    protected $table = 'analytics_daily';

    public $timestamps = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['day' => 'date'];
    }
}
