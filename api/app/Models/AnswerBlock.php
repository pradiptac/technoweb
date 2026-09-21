<?php

namespace App\Models;

use App\Enums\AnswerBlockKind;
use App\Enums\PublishStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * One answer on a record's page: a definition, a fact, a step, a question.
 *
 * The `Faq` shape with a `kind` — see `AnswerBlockKind` for what each one is
 * and where the page draws it. `answer` is the direct answer, plain text and
 * short, because it is the sentence an assistant quotes; `detail` is the
 * explanation under it, rich text through `HtmlSanitiser` like any body.
 *
 * Owned wholesale by its record: written by `saveAnswerBlocks()`, which
 * replaces the set on every save the way `saveFaqs()` does, so there is no
 * stable identity to match on and none is needed.
 */
class AnswerBlock extends Model
{
    protected $fillable = ['kind', 'question', 'answer', 'detail', 'sort_order', 'status'];

    protected function casts(): array
    {
        return [
            'kind' => AnswerBlockKind::class,
            'status' => PublishStatus::class,
            'sort_order' => 'integer',
        ];
    }

    /** @return MorphTo<Model, $this> */
    public function blockable(): MorphTo
    {
        return $this->morphTo();
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', PublishStatus::Published);
    }
}
