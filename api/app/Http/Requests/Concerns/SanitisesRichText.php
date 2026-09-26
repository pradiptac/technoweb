<?php

namespace App\Http\Requests\Concerns;

use App\Support\CustomFields\CustomFields;
use App\Support\HtmlSanitiser;
use Illuminate\Support\Arr;

/**
 * Cleans rich-text fields before validation, so nothing downstream — the
 * controller, the model, a queued job — can ever see the raw markup.
 *
 * Sitting in prepareForValidation() rather than the controller means every
 * CMS entity that follows blog posts gets sanitisation by declaring
 * richTextFields(), with no chance of a new controller forgetting to call it.
 *
 * A field may name one level of repeater — `answer_blocks.*.detail` — and
 * every row's `detail` is cleaned. It has to be spelled here rather than
 * relied on from the rule set: `$this->has('answer_blocks.*.detail')` is
 * false for a wildcard, so the first cut listed the path and cleaned nothing,
 * which is exactly the failure the trait exists to make impossible.
 *
 * The part after the wildcard may itself be a dotted path —
 * `blocks.*.data.body`, a page-builder section's rich text (2026-09-26) —
 * read and written with `Arr::get`/`Arr::set`, so a row whose nested object
 * is missing the key is left alone rather than given one. Still one
 * wildcard: a repeater inside a repeater names its own sanitiser.
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

        /*
         * An FAQ answer is rich text wherever it is written.
         *
         * The FAQ screen's own request declares `answer`; the eleven entity
         * forms that carry an `faqs[]` repeater declared nothing for it, so
         * the same answer, rendered through the same `Prose`, was cleaned
         * when saved on one screen and stored as typed on the other. Added
         * here, once, rather than to eleven lists that each have to
         * remember it — a request with no `faqs` key is untouched.
         */
        $fields = array_values(array_unique([...$this->richTextFields(), 'faqs.*.answer']));

        foreach ($fields as $field) {
            if (str_contains($field, '.*.')) {
                [$list, $column] = explode('.*.', $field, 2);
                $rows = $this->input($list);

                if (is_array($rows)) {
                    foreach ($rows as $i => $row) {
                        // A non-string is left for validation to refuse.
                        if (! is_array($row) || ! Arr::has($row, $column)) {
                            continue;
                        }
                        $value = Arr::get($row, $column);
                        if (is_string($value) || $value === null) {
                            Arr::set($rows[$i], $column, HtmlSanitiser::clean($value));
                        }
                    }

                    $clean[$list] = $rows;
                }

                continue;
            }

            if ($this->has($field)) {
                $clean[$field] = HtmlSanitiser::clean($this->input($field));
            }
        }

        // Custom fields' rich-text values, for a request that accepts them
        // (`AcceptsCustomFields`). Which keys are rich text is a fact about
        // the stored definitions, not a list this request could spell.
        if (method_exists($this, 'customFieldTarget') && is_array($this->input('custom_fields'))) {
            $clean['custom_fields'] = CustomFields::sanitise($this->customFieldTarget(), $this->input('custom_fields'));
        }

        if ($clean) {
            $this->merge($clean);
        }
    }
}
