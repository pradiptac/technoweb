<?php

namespace App\Models\Concerns;

use App\Models\AnswerBlock;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * The record carries answer blocks — the "What is it / Who is it for / Why /
 * Key facts / Use cases / Steps / Questions" sections of its public page.
 *
 * Two relations because the two readers want different sets: the console
 * edits every block, drafts included, and the public page draws only what is
 * published. Both are ordered, so neither reader sorts.
 *
 * `publishedAnswerBlocks` is a relation rather than a filtered collection so
 * a public controller can eager-load it by name — `preventLazyLoading` is on,
 * and a resource filtering `answerBlocks` in PHP would still need the whole
 * set loaded first.
 */
trait HasAnswerBlocks
{
    /** @return MorphMany<AnswerBlock, $this> */
    public function answerBlocks(): MorphMany
    {
        return $this->morphMany(AnswerBlock::class, 'blockable')->orderBy('sort_order')->orderBy('id');
    }

    /** @return MorphMany<AnswerBlock, $this> */
    public function publishedAnswerBlocks(): MorphMany
    {
        return $this->answerBlocks()->published();
    }
}
