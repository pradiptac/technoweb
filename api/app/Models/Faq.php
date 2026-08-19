<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class Faq extends Model
{
    protected $fillable = ['question', 'answer', 'faqable_type', 'faqable_id', 'sort_order'];

    public function faqable(): MorphTo
    {
        return $this->morphTo();
    }
}
