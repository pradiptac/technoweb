<?php

namespace App\Models;

use App\Enums\PublishStatus;
use App\Models\Concerns\HasSeo;
use App\Models\Concerns\Sluggable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class KnowledgeArticle extends Model
{
    use HasSeo, Sluggable;

    protected $fillable = [
        'knowledge_category_id', 'title', 'slug', 'excerpt', 'body',
        'tags', 'status', 'view_count', 'helpful_count', 'published_at',
    ];

    protected function casts(): array
    {
        return ['tags' => 'array', 'status' => PublishStatus::class, 'published_at' => 'datetime'];
    }

    public function urlPrefix(): string
    {
        return '/knowledge-base';
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(KnowledgeCategory::class, 'knowledge_category_id');
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', PublishStatus::Published);
    }

    /** Simple relevance search — good enough before a search engine is added. */
    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (blank($term)) {
            return $query;
        }

        return $query->where(function (Builder $q) use ($term) {
            $q->where('title', 'like', "%{$term}%")
                ->orWhere('excerpt', 'like', "%{$term}%")
                ->orWhere('body', 'like', "%{$term}%");
        });
    }

    public function defaultSeo(): array
    {
        return [
            'title' => $this->title.' — Technoware knowledge base',
            'description' => str($this->excerpt ?? $this->body ?? '')->stripTags()->squish()->limit(155)->value(),
            'canonical_url' => config('app.frontend_url').'/knowledge-base/'.$this->slug,
            'og_image' => null,
            'schema_type' => 'TechArticle',
        ];
    }
}
