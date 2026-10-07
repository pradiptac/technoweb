<?php

namespace App\Http\Resources\Admin;

use App\Http\Resources\Concerns\IncludesAnswerContent;
use App\Http\Resources\Concerns\IncludesCustomFields;
use App\Http\Resources\Concerns\IncludesSections;
use App\Models\Solution;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Solution */
class SolutionResource extends JsonResource
{
    use IncludesAnswerContent, IncludesCustomFields, IncludesSections;

    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show', '*.store', '*.update');

        return [
            'id' => $this->id,
            'title' => $this->title,
            'slug' => $this->slug,
            'summary' => $this->summary,
            'problem_statement' => $this->when($detail, $this->problem_statement),
            'overview' => $this->when($detail, $this->overview),
            // Which of the two the page draws in its body area, and the builder's
            // sections as stored (0.129.0) — see IncludesSections.
            ...$this->adminSections($detail),
            // Always lists, never null — the repeaters render rows from these.
            'benefits' => $this->benefits ?? [],
            'technologies' => $this->technologies ?? [],
            'icon' => $this->icon,
            'hero_image_path' => $this->hero_image_path,
            'hero_image' => $this->hero_image_path ? asset('storage/'.$this->hero_image_path) : null,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'sort_order' => (int) $this->sort_order,
            'show_in_menu' => (bool) $this->show_in_menu,
            'product_ids' => $this->whenLoaded('products', fn () => $this->products->pluck('id')),
            'industry_ids' => $this->whenLoaded('industries', fn () => $this->industries->pluck('id')),
            'faqs' => $this->whenLoaded('faqs', fn () => $this->faqs->map(fn ($f) => [
                'question' => $f->question,
                'answer' => $f->answer,
            ])),
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
