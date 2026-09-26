<?php

namespace App\Http\Requests\Concerns;

use App\Support\CustomFields\CustomFields;

/**
 * The request accepts `custom_fields` for the record it writes.
 *
 * The rules are generated from the stored definitions (`CustomFields::rules`)
 * and spread in only when the request carries the key: a `PATCH` that does
 * not mention custom fields is not made to satisfy a required one, and
 * leaves every value where it was. Rich-text values are cleaned before
 * validation by `SanitisesRichText`, which asks this trait's target.
 */
trait AcceptsCustomFields
{
    /** The target key this request's record is attached to groups by. */
    abstract protected function customFieldTarget(): string;

    /** @return array<string, array<int, mixed>> */
    protected function customFieldRules(): array
    {
        return $this->has('custom_fields') ? CustomFields::rules($this->customFieldTarget()) : [];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return $this->has('custom_fields') ? CustomFields::attributes($this->customFieldTarget()) : [];
    }
}
