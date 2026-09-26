<?php

namespace App\Http\Resources;

use App\Http\Resources\Concerns\IncludesAnswerContent;
use App\Http\Resources\Concerns\IncludesCustomFields;
use App\Http\Resources\Concerns\IncludesSchema;
use App\Http\Resources\Concerns\IncludesSeo;
use App\Models\Industry;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Industry */
class IndustryResource extends JsonResource
{
    use IncludesAnswerContent, IncludesCustomFields, IncludesSchema, IncludesSeo;

    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show');

        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            // The sitemap's `lastmod`: a record's own last change, never the build time. `docs/seo-audit-2026-09-18.md`, F2.
            'updated_at' => $this->updated_at?->toIso8601String(),
            'summary' => $this->summary,
            'icon' => $this->icon,
            'body' => $this->when($detail, $this->body),
            'solutions' => SolutionResource::collection($this->whenLoaded('solutions')),
            'faqs' => $this->publicFaqs(),
            // The published blocks, in order, with the heading each renders under.
            'answer_blocks' => $this->publicAnswerBlocks(),
            // What this record is connected to, on the page only (`EntityLinks`).
            'entity' => $this->entity(),
            // An FAQPage over the FAQs and question blocks; absent under two entries.
            'faq_schema' => $this->faqSchema(),
            // Custom fields (docs/custom-content.md) — see IncludesCustomFields.
            ...$this->publicCustomFields(),
            'seo' => $this->seo(),
        ];
    }
}
