<?php

namespace App\Http\Resources;

use App\Http\Resources\Concerns\IncludesSchema;
use App\Http\Resources\Concerns\IncludesSeo;
use App\Models\KnowledgeArticle;
use App\Support\StructuredData;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin KnowledgeArticle */
class KnowledgeArticleResource extends JsonResource
{
    use IncludesSchema, IncludesSeo;

    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show');

        return [
            'id' => $this->id,
            'title' => $this->title,
            'slug' => $this->slug,
            'excerpt' => $this->excerpt,
            'body' => $this->when($detail, $this->body),
            'tags' => $this->tags,
            'category' => $this->whenLoaded('category', fn () => [
                'name' => $this->category->name,
                'slug' => $this->category->slug,
            ]),
            'published_at' => $this->published_at?->toIso8601String(),
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
