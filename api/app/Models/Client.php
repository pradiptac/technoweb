<?php

namespace App\Models;

use App\Enums\PublishStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A company this business has worked for — a name and a logo on the wall,
 * not a portal account. Portal customers are `Customer`, and publishing that
 * list is exactly what the registration endpoint goes out of its way not to
 * do; this table holds what the company has *chosen* to say.
 *
 * No slug: listed on `/clients`, no page of its own.
 */
class Client extends Model
{
    protected $fillable = [
        'name', 'logo_path', 'website_url', 'industry_id', 'note',
        'is_featured', 'status', 'sort_order',
    ];

    protected $attributes = [
        'status' => 'draft',
        'is_featured' => false,
        'sort_order' => 0,
    ];

    protected function casts(): array
    {
        return [
            'status' => PublishStatus::class,
            'is_featured' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    public function industry(): BelongsTo
    {
        return $this->belongsTo(Industry::class);
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', PublishStatus::Published);
    }
}
