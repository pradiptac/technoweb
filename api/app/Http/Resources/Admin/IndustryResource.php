<?php

namespace App\Http\Resources\Admin;

use App\Http\Resources\Concerns\IncludesAnswerContent;
use App\Http\Resources\Concerns\IncludesCustomFields;
use App\Http\Resources\Concerns\IncludesSections;
use App\Models\Industry;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Industries have no status column — every one is live. That is deliberate in
 * the schema: the set is a fixed taxonomy the navigation and case studies
 * both key off, not a stream of publishable content.
 */
/** @mixin Industry */
class IndustryResource extends JsonResource
{
    use IncludesAnswerContent, IncludesCustomFields, IncludesSections;

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
            // Which of the two the page draws in its body area, and the builder's
            // sections as stored (0.129.0) — see IncludesSections.
            ...$this->adminSections($detail),
            'icon' => $this->icon,
            'sort_order' => (int) $this->sort_order,
            'show_in_menu' => (bool) $this->show_in_menu,
            'solution_ids' => $this->whenLoaded('solutions', fn () => $this->solutions->pluck('id')),
            'case_study_count' => $this->whenCounted('caseStudies'),
            'faqs' => $this->adminFaqs(),
            // Every block, drafts included, for the AEO tab's repeater.
            'answer_blocks' => $this->adminAnswerBlocks(),
            // Custom fields (docs/custom-content.md) — see IncludesCustomFields.
            ...$this->adminCustomFields(),
            'seo' => $this->when($detail, fn () => SeoOverrideArray::from($this->seo)),
            'seo_defaults' => $this->when($detail, fn () => $this->resolvedSeo()),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
