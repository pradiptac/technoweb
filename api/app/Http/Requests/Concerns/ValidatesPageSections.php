<?php

namespace App\Http\Requests\Concerns;

use App\Support\PageSections\CustomCodeGuard;
use App\Support\PageSections\SectionRules;
use Illuminate\Validation\Validator;

/**
 * A page's builder sections (`blocks`), for the two page requests and the
 * preview: the rules generated per row from each row's type, and the checks
 * no rule can express (`SectionRules::after`). The rich text inside them is
 * the request's `richTextFields()`'s job — `blocks.*.data.body` — so it is
 * cleaned before any of this sees it.
 */
trait ValidatesPageSections
{
    /** @return array<string, mixed> */
    protected function sectionRules(): array
    {
        return SectionRules::forPayload($this->input('blocks'));
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            SectionRules::after($v, $this->input('blocks'));
            if ($this->guardsCustomCode()) {
                CustomCodeGuard::check($v, $this->input('blocks'));
            }
        });
    }

    /** Who may run custom code on the page itself is checked wherever sections are saved; a preview saves nothing. */
    protected function guardsCustomCode(): bool
    {
        return true;
    }
}
