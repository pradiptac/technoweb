<?php

namespace App\Http\Resources\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Blog post as the CMS sees it — deliberately not the public BlogPostResource.
 *
 * Two reasons it cannot be shared. The public resource decides index-vs-detail
 * from routeIs('*.show'), which silently drops `body` on any route not named
 * that way. And it omits `status`, `author_id` and the raw SEO row, all of
 * which the edit form has to round-trip.
 *
 * The SEO block is the important part: HasSeo::resolvedSeo() merges overrides
 * over derived defaults and is lossy by design, so it cannot tell "the editor
 * typed this" from "we generated this". The form needs both — `seo` is what
 * was actually typed (nulls and all), `seo_defaults` is what the site will
 * fall back to, shown as placeholder text.
 */
class BlogPostResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show', '*.store', '*.update');

        return [
            'id' => $this->id,
            'title' => $this->title,
            'slug' => $this->slug,
            'excerpt' => $this->excerpt,
            'body' => $this->when($detail, $this->body),
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'is_featured' => (bool) $this->is_featured,
            'comments_enabled' => (bool) $this->comments_enabled,
            /*
             * Both shapes, because the form needs two different things: the
             * multi-select is driven by ids, and the list screen shows names.
             * Sending only ids would make the console look each one up again
             * against a list it already has.
             */
            'category_ids' => $this->whenLoaded('categories', fn () => $this->categories->pluck('id')->all()),
            'categories' => $this->whenLoaded(
                'categories',
                fn () => $this->categories->map(fn ($c) => ['id' => $c->id, 'name' => $c->name, 'slug' => $c->slug])->all(),
            ),
            'published_at' => $this->published_at?->toIso8601String(),
            'reading_minutes' => $this->reading_minutes,
            'cover_image_path' => $this->cover_image_path,
            'cover_image' => $this->cover_image_path ? asset('storage/'.$this->cover_image_path) : null,
            'author_id' => $this->author_id,
            'author' => $this->whenLoaded('author', fn () => $this->author ? [
                'id' => $this->author->id,
                'name' => $this->author->name,
            ] : null),
            'seo' => $this->when($detail, fn () => SeoOverrideArray::from($this->seo)),
            'seo_defaults' => $this->when($detail, fn () => $this->resolvedSeo()),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
