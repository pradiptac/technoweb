<?php

namespace App\Models;

use App\Enums\PublishStatus;
use App\Models\Concerns\HasSeo;
use App\Models\Concerns\Sluggable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Solution extends Model
{
    use HasSeo, Sluggable;

    protected $fillable = [
        'title', 'slug', 'summary', 'problem_statement', 'overview',
        'benefits', 'technologies', 'icon', 'hero_image_path', 'status', 'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'benefits' => 'array',
            'technologies' => 'array',
            'status' => PublishStatus::class,
        ];
    }

    public function urlPrefix(): string
    {
        return '/solutions';
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', PublishStatus::Published);
    }

    public function products(): BelongsToMany
    {
        return $this->belongsToMany(Product::class);
    }

    public function industries(): BelongsToMany
    {
        return $this->belongsToMany(Industry::class);
    }

    public function faqs(): MorphMany
    {
        return $this->morphMany(Faq::class, 'faqable')->orderBy('sort_order');
    }

    public function defaultSeo(): array
    {
        return [
            'title' => $this->title.' — Technoware',
            'description' => str($this->summary ?? $this->overview ?? '')
                ->stripTags()->squish()->limit(155)->value(),
            'canonical_url' => config('app.frontend_url').'/solutions/'.$this->slug,
            'og_image' => $this->hero_image_path ? asset('storage/'.$this->hero_image_path) : null,
            'schema_type' => 'Service',
        ];
    }
}
