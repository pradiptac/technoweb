<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class SeoMetadata extends Model
{
    protected $table = 'seo_metadata';

    protected $fillable = [
        'seoable_type', 'seoable_id', 'title', 'description', 'canonical_url',
        'robots', 'focus_keyword', 'og_title', 'og_description', 'og_image_path',
        'schema_type', 'sitemap_include', 'sitemap_priority', 'sitemap_changefreq',
        'health_score', 'health_report',
    ];

    protected function casts(): array
    {
        return [
            'sitemap_include' => 'boolean',
            'sitemap_priority' => 'float',
            'health_report' => 'array',
        ];
    }

    public function seoable(): MorphTo
    {
        return $this->morphTo();
    }
}
