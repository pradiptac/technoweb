<?php

namespace App\Http\Requests\Concerns;

use App\Support\HtmlSanitiser;

/**
 * Cleans rich-text fields before validation, so nothing downstream — the
 * controller, the model, a queued job — can ever see the raw markup.
 *
 * Sitting in prepareForValidation() rather than the controller means every
 * CMS entity that follows blog posts gets sanitisation by declaring
 * richTextFields(), with no chance of a new controller forgetting to call it.
 */
trait SanitisesRichText
{
    /** Fields holding editor HTML. Override per request. */
    protected function richTextFields(): array
    {
        return ['body'];
    }

    protected function prepareForValidation(): void
    {
        $clean = [];

        foreach ($this->richTextFields() as $field) {
            if ($this->has($field)) {
                $clean[$field] = HtmlSanitiser::clean($this->input($field));
            }
        }

        if ($clean) {
            $this->merge($clean);
        }
    }
}
