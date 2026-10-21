<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One counted thing: a page view, an event or a conversion. Never an address (C3, docs/analytics.md). */
class AnalyticsHit extends Model
{
    public $timestamps = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['entry' => 'boolean', 'day' => 'date', 'at' => 'datetime'];
    }
}
