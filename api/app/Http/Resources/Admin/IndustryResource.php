<?php

namespace App\Http\Resources\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Industries have no status column — every one is live. That is deliberate in
 * the schema: the set is a fixed taxonomy the navigation and case studies
 * both key off, not a stream of publishable content.
 */
class IndustryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show', '*.store', '*.update');

        return [
            'id' => $this->id,
            // `name`, not `title` — Sluggable::slugSource() is overridden for
            // this model, and the column follows.
            'name' => $this->name,
            'slug' => $this->slug,
            'summary' => $this->summary,
            'body' => $this->when($detail, $this->body),
            'icon' => $this->icon,
            'sort_order' => (int) $this->sort_order,
            'solution_ids' => $this->whenLoaded('solutions', fn () => $this->solutions->pluck('id')),
            'case_study_count' => $this->whenCounted('caseStudies'),
            'seo' => $this->when($detail, fn () => SeoOverrideArray::from($this->seo)),
            'seo_defaults' => $this->when($detail, fn () => $this->resolvedSeo()),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
