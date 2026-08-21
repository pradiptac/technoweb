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

    /**
     * Simple relevance search — good enough before a real search engine.
     *
     * Searches tags as well as prose, and matches a punctuation-stripped form
     * of the title so "wifi" finds "Wi-Fi" and "wi fi". People do not type the
     * hyphens, and a knowledge base that cannot be found is a knowledge base
     * that deflects nothing.
     */
    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        $term = trim((string) $term);

        if ($term === '') {
            return $query;
        }

        $like = '%'.$term.'%';
        $compact = preg_replace('/[^a-z0-9]/i', '', $term);

        return $query->where(function (Builder $q) use ($like, $compact) {
            $q->where('title', 'like', $like)
                ->orWhere('excerpt', 'like', $like)
                ->orWhere('body', 'like', $like)
                ->orWhere('tags', 'like', $like);

            // Short fragments would match nearly everything once punctuation
            // is stripped, so only widen the net for real words.
            if (strlen((string) $compact) >= 3) {
                $q->orWhereRaw(
                    "REPLACE(REPLACE(REPLACE(LOWER(title), '-', ''), ' ', ''), '.', '') LIKE ?",
                    ['%'.strtolower($compact).'%']
                );
            }
        });
    }

    public function defaultSeo(): array
    {
        return [
            // No brand suffix: the frontend's metadata template already
            // appends "| Technoware", and adding it here too put the name
            // in the <title> twice. Descriptive qualifiers stay — they say
            // what kind of page it is, which the template does not.
            'title' => $this->title.' — knowledge base',
            'description' => str($this->excerpt ?? $this->body ?? '')->stripTags()->squish()->limit(155)->value(),
            'canonical_url' => config('app.frontend_url').'/knowledge-base/'.$this->slug,
            'og_image' => null,
            'schema_type' => 'TechArticle',
        ];
    }
}
