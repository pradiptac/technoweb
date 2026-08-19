<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class Enquiry extends Model
{
    protected $table = 'enquiries';

    protected $fillable = [
        'name', 'email', 'phone', 'company', 'subject', 'message',
        'source', 'enquirable_type', 'enquirable_id', 'status', 'ip_address',
    ];

    public function enquirable(): MorphTo
    {
        return $this->morphTo();
    }
}
