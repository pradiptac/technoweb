<?php

namespace App\Http\Requests\Concerns;

use App\Support\PageSections\RecordSections;
use Illuminate\Validation\Validator;

/**
 * Builder sections on a record that is not a page (`blocks`, `body_layout`)
 * — the page builder's own rules per row, plus what a record's body area
 * cannot hold (`RecordSections::after`). The rich text inside them is the
 * request's `richTextFields()`'s job (`SectionRules::RICH_TEXT`), so it is
 * cleaned before any of this sees it.
 */
trait ValidatesRecordSections
{
    /** @return array<string, mixed> */
    protected function recordSectionRules(): array
    {
        return RecordSections::rules($this->input('blocks'));
    }

    /** @return array<string, string> */
    protected function recordSectionMessages(): array
    {
        return RecordSections::messages($this->input('blocks'));
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            RecordSections::after($v, $this->input('blocks'));
        });
    }
}
