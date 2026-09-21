<?php

namespace App\Http\Resources\Concerns;

use App\Http\Resources\AnswerBlockResource;
use App\Http\Resources\FaqResource;
use App\Models\AnswerBlock;
use App\Models\Faq;

/**
 * The answer blocks and the FAQs a record carries, in the two shapes the
 * two sides of the console want.
 *
 * The admin shape round-trips exactly what the repeater edits — every block,
 * drafts included, with its id and status. The public shape is the published
 * set with the section `heading` each block renders under, and no ids: a
 * page has no use for them. Both are `whenLoaded`, so an index that did not
 * load the relation carries no key, and a detail read that did carries `[]`
 * for a record with none rather than an absent key the frontend has to
 * guard for.
 *
 * `preventLazyLoading` is on outside production, which is what makes the
 * relation name in the controller's `load()` the whole of the contract:
 * `answerBlocks` for the console, `publishedAnswerBlocks` for the site.
 */
trait IncludesAnswerContent
{
    /** Every block, for the console's repeater. */
    protected function adminAnswerBlocks(): mixed
    {
        return $this->whenLoaded('answerBlocks', fn () => $this->resource->answerBlocks->map(fn (AnswerBlock $b) => [
            'id' => $b->id,
            'kind' => $b->kind->value,
            'question' => $b->question,
            'answer' => $b->answer,
            'detail' => $b->detail,
            'sort_order' => (int) $b->sort_order,
            'status' => $b->status->value,
        ])->values());
    }

    /** Every FAQ, for the console's repeater — the shape `FaqField` posts back. */
    protected function adminFaqs(): mixed
    {
        return $this->whenLoaded('faqs', fn () => $this->resource->faqs->map(fn (Faq $f) => [
            'question' => $f->question,
            'answer' => $f->answer,
        ])->values());
    }

    /** The published blocks, for the page. */
    protected function publicAnswerBlocks(): mixed
    {
        return AnswerBlockResource::collection($this->whenLoaded('publishedAnswerBlocks'));
    }

    /** The FAQs, for the page. */
    protected function publicFaqs(): mixed
    {
        return FaqResource::collection($this->whenLoaded('faqs'));
    }
}
