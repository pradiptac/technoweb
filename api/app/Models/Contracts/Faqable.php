<?php

namespace App\Models\Contracts;

use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * A record that carries FAQs.
 *
 * An interface rather than a trait, because what the write path needs is a
 * *type*: `WritesAnswerContent::saveFaqs()` takes one of these, so the
 * analyser can see `faqs()` on it instead of reporting an undefined method
 * on `Model` in the context of every controller using the trait — which is
 * what the baseline used to hold, one entry per controller.
 */
interface Faqable
{
    public function faqs(): MorphMany;
}
