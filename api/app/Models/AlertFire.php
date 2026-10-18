<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One (rule, subject, person): fired once, re-armed after it clears (docs/digest-alerts.md). */
class AlertFire extends Model
{
    public $timestamps = false;

    protected $fillable = ['rule', 'subject', 'user_id', 'fired_at', 'cleared_at'];

    protected function casts(): array
    {
        return ['fired_at' => 'datetime', 'cleared_at' => 'datetime'];
    }
}
