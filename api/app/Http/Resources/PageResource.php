<?php

namespace App\Http\Resources;

use App\Http\Resources\Concerns\IncludesAnswerContent;
use App\Http\Resources\Concerns\IncludesSchema;
use App\Http\Resources\Concerns\IncludesSeo;
use App\Models\Page;
use App\Support\PageSections\SectionPresenter;
use App\Support\StructuredData;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Http\Resources\MissingValue;

/** @mixin Page */
class PageResource extends JsonResource
{
    use IncludesAnswerContent, IncludesSchema, IncludesSeo;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'slug' => $this->slug,
            'body' => $this->body,
            'template' => $this->template,
            // A builder page's sections, presented — hidden ones omitted —
            // and only for a builder page; the body is still sent, so
            // switching the template back loses nothing (2026-09-26).
            'sections' => $this->when($this->template === 'builder', fn () => SectionPresenter::present($this->blocks, $this->resource)),
            'published_at' => $this->published_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            'faqs' => FaqResource::collection($this->whenLoaded('faqs')),
            // The published blocks, in order, with the heading each renders under.
            'answer_blocks' => $this->publicAnswerBlocks(),
            // What this record is connected to, on the page only (`EntityLinks`).
            'entity' => $this->entity(),
            // An FAQPage over the FAQs and question blocks; absent under two entries.
            // A builder page's own questions join it, so there is still one.
            'faq_schema' => $this->template === 'builder' ? $this->builderFaqSchema() : $this->faqSchema(),
            'seo' => $this->seo(),
        ];
    }

    /**
     * The `FAQPage` over the page's FAQs, its question blocks **and** the
     * questions its `faq` sections carry — one graph, under the same
     * two-entry gate, never a second one beside it.
     */
    private function builderFaqSchema(): mixed
    {
        if (! $this->includeSchema) {
            return new MissingValue;
        }

        $faqs = $this->resource->relationLoaded('faqs') ? $this->resource->getRelation('faqs')->all() : [];
        $blocks = $this->resource->relationLoaded('publishedAnswerBlocks') ? $this->resource->getRelation('publishedAnswerBlocks') : [];

        return StructuredData::answerFaqs([...$faqs, ...SectionPresenter::faqEntries($this->blocks)], $blocks) ?? new MissingValue;
    }
}
