<?php

namespace App\Http\Resources\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Knowledge article as the CMS sees it. Same reasoning as
 * Admin\BlogPostResource: the public resource hides drafts' fields behind a
 * route-name check and omits the raw SEO overrides the edit form must
 * round-trip.
 */
class KnowledgeArticleResource extends JsonResource
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
            'tags' => $this->tags ?? [],
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'published_at' => $this->published_at?->toIso8601String(),
            'knowledge_category_id' => $this->knowledge_category_id,
            'category' => $this->whenLoaded('category', fn () => $this->category ? [
                'id' => $this->category->id,
                'name' => $this->category->name,
            ] : null),
            // Read-only telemetry. Shown in the list so an editor can see what
            // is actually being read; never accepted from the form.
            'view_count' => (int) $this->view_count,
            'helpful_count' => (int) $this->helpful_count,
            'seo' => $this->when($detail, fn () => SeoOverrideArray::from($this->seo)),
            'seo_defaults' => $this->when($detail, fn () => $this->resolvedSeo()),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
