<?php

namespace App\Models;

use App\Enums\PublishStatus;
use App\Models\Concerns\HasSeo;
use App\Models\Concerns\Sluggable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BlogPost extends Model
{
    use HasSeo, Sluggable;

    protected $fillable = [
        'author_id', 'title', 'slug', 'excerpt', 'body',
        'cover_image_path', 'status', 'published_at', 'reading_minutes',
    ];

    protected function casts(): array
    {
        return ['status' => PublishStatus::class, 'published_at' => 'datetime'];
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

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', PublishStatus::Published)
            ->whereNotNull('published_at')
            ->where('published_at', '<=', now());
    }

    public function defaultSeo(): array
    {
        return [
            'title' => $this->title,
            'description' => str($this->excerpt ?? $this->body ?? '')->stripTags()->squish()->limit(155)->value(),
            'canonical_url' => config('app.frontend_url').'/blog/'.$this->slug,
            'og_image' => $this->cover_image_path ? asset('storage/'.$this->cover_image_path) : null,
            'schema_type' => 'Article',
        ];
    }
}
