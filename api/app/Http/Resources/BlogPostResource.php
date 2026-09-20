<?php

namespace App\Http\Resources;

use App\Http\Resources\Concerns\IncludesSchema;
use App\Http\Resources\Concerns\IncludesSeo;
use App\Models\BlogPost;
use App\Support\Blog\Comments;
use App\Support\MediaMeta;
use App\Support\StructuredData;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin BlogPost */
class BlogPostResource extends JsonResource
{
    use IncludesSchema, IncludesSeo;

    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show');

        return [
            'id' => $this->id,
            'title' => $this->title,
            'slug' => $this->slug,
            // The sitemap's `lastmod`: a record's own last change, never the build time. `docs/seo-audit-2026-09-18.md`, F2.
            'updated_at' => $this->updated_at?->toIso8601String(),
            'excerpt' => $this->excerpt,
            'body' => $this->when($detail, $this->body),
            'cover_image' => $this->cover_image_path ? asset('storage/'.$this->cover_image_path) : null,
            'cover_image_alt' => MediaMeta::alt($this->cover_image_path),
            'cover_image_focus' => MediaMeta::focus($this->cover_image_path),
            /*
             * Present only when eager-loaded, which every listing does. A post
             * carries several, so this is a list rather than one name: the
             * cards render a badge per category and the strip is built from
             * the same vocabulary.
             */
            'categories' => BlogCategoryResource::collection($this->whenLoaded('categories')),
            'is_featured' => (bool) $this->is_featured,
            /*
             * Whether this post is open for comment, resolved rather than
             * echoed: the column alone is not the answer — the site-wide switch
             * and the age window both close it, and the frontend must not have
             * to know that. One place decides, which is `Blog\Comments`.
             */
            'comments_open' => Comments::openOn($this->resource),
            'published_at' => $this->published_at?->toIso8601String(),
            'reading_minutes' => $this->reading_minutes,
            'author' => $this->whenLoaded('author', fn () => ['name' => $this->author->name]),
            /*
             * The post before and after this one, on a detail read only. A
             * title and a slug, nothing more: the foot of an article is two
             * links, and a card's worth of data for each would be fetched by
             * every read of every post for the sake of a line of text. Null
             * at either end of the blog, which the frontend renders as
             * nothing rather than as a dead control.
             */
            'previous' => $this->whenLoaded('previous', fn () => $this->previous ? ['title' => $this->previous->title, 'slug' => $this->previous->slug] : null),
            'next' => $this->whenLoaded('next', fn () => $this->next ? ['title' => $this->next->title, 'slug' => $this->next->slug] : null),
            'seo' => $this->seo(),
            /*
             * The page's JSON-LD, built server-side.
             *
             * Gated on `withSchema()` rather than on the route, because a nested
             * resource inherits its parent's route name — twenty products inside
             * /solutions/{slug} would each build a Product graph and lazy-load a
             * brand and a category. See the IncludesSchema trait.
             *
             * The frontend renders it through `JsonLd`, which escapes `<`. That
             * boundary stays there: JSON.stringify does not escape it, and a CMS
             * field containing `</script>` would close the block.
             */
            'schema' => $this->schema(fn () => StructuredData::article($this->resource)),
        ];
    }
}
