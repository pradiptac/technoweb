<?php

namespace App\Models\Contracts;

use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * A record that carries answer blocks. `HasAnswerBlocks` is the
 * implementation; this is the type the write path and the resources ask
 * for. See `Faqable` for why it is an interface.
 */
interface Answerable
{
    public function answerBlocks(): MorphMany;

    public function publishedAnswerBlocks(): MorphMany;
}
