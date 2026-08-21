<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class KnowledgeArticleResource extends JsonResource
{
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
        ];
    }
}
