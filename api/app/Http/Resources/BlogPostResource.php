<?php

namespace App\Http\Resources;

use App\Http\Resources\Concerns\IncludesSchema;
use App\Support\MediaAlt;
use App\Support\StructuredData;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BlogPostResource extends JsonResource
{
    use IncludesSchema;

    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show');

        return [
            'id' => $this->id,
            'title' => $this->title,
            'slug' => $this->slug,
            'excerpt' => $this->excerpt,
            'body' => $this->when($detail, $this->body),
            'cover_image' => $this->cover_image_path ? asset('storage/'.$this->cover_image_path) : null,
            'cover_image_alt' => MediaAlt::for($this->cover_image_path),
            /*
             * Present only when eager-loaded, which every listing does. A post
             * carries several, so this is a list rather than one name: the
             * cards render a badge per category and the strip is built from
             * the same vocabulary.
             */
            'categories' => BlogCategoryResource::collection($this->whenLoaded('categories')),
            'is_featured' => (bool) $this->is_featured,
            'published_at' => $this->published_at?->toIso8601String(),
            'reading_minutes' => $this->reading_minutes,
            'author' => $this->whenLoaded('author', fn () => ['name' => $this->author->name]),
            // Present only when eager-loaded. Deliberately not keyed on the
            // route: a nested resource inherits the parent's route name, so
            // an industry rendered inside /solutions/{slug} used to think it
            // was a detail view and lazy-load its own SEO row.
            // relationLoaded, not whenLoaded: whenLoaded short-circuits to null
            // when the relation is loaded but empty, and most records have no
            // override row — we still want the derived defaults for those.
            'seo' => $this->when(
                $this->resource->relationLoaded('seo'),
                fn () => new SeoResource($this->resolvedSeo())
            ),
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
