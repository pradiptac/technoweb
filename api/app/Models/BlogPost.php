<?php

namespace App\Models;

use App\Enums\PublishStatus;
use App\Models\Concerns\HasSeo;
use App\Models\Concerns\Sluggable;
use App\Support\HtmlSanitiser;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class BlogPost extends Model
{
    use HasSeo, Sluggable;

    protected $fillable = [
        'author_id', 'title', 'slug', 'excerpt', 'body',
        'cover_image_path', 'status', 'is_featured', 'published_at', 'reading_minutes',
    ];

    /**
     * A boolean with a column default must match in memory.
     *
     * `is_featured` is `default(false)` in the database and would be **null**
     * on a post created and asked about in the same breath — the bug the store
     * models were fixed for, where a variation called itself unsellable
     * because `is_active` had not been read back.
     */
    protected $attributes = ['is_featured' => false];

    protected function casts(): array
    {
        return [
            'status' => PublishStatus::class,
            'is_featured' => 'boolean',
            'published_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        // Reading time is derived, not typed in — one less thing to forget.
        static::saving(function (self $post) {
            $words = str_word_count(strip_tags((string) $post->body));
            $post->reading_minutes = max(1, (int) ceil($words / 220));
        });
    }

    public function urlPrefix(): string
    {
        return '/blog';
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id');
    }

    public function categories(): BelongsToMany
    {
        return $this->belongsToMany(BlogCategory::class)->orderBy('sort_order');
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', PublishStatus::Published)
            ->whereNotNull('published_at')
            ->where('published_at', '<=', now());
    }

    /**
     * Title, excerpt and body.
     *
     * Body included, unlike the assistant's retrieval, which deliberately
     * searches titles and summaries only — there the risk is a long field
     * matching every question and ranking nothing. Here the visitor typed the
     * word on purpose and expects the article that contains it, which is what
     * the knowledge base's own `scopeSearch` already does.
     */
    public function scopeSearch(Builder $query, string $term): Builder
    {
        $like = '%'.str_replace(['%', '_'], ['\%', '\_'], $term).'%';

        return $query->where(function (Builder $q) use ($like) {
            $q->where('title', 'like', $like)
                ->orWhere('excerpt', 'like', $like)
                ->orWhere('body', 'like', $like);
        });
    }

    public function defaultSeo(): array
    {
        return [
            'title' => $this->title,
            'description' => str(HtmlSanitiser::toText($this->excerpt ?? $this->body ?? ''))->limit(155)->value(),
            'canonical_url' => config('app.frontend_url').'/blog/'.$this->slug,
            'og_image' => $this->cover_image_path ? asset('storage/'.$this->cover_image_path) : null,
            'schema_type' => 'Article',
        ];
    }
}
