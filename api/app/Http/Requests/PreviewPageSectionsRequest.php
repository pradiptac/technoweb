<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\SanitisesRichText;
use App\Http\Requests\Concerns\ValidatesPageSections;
use App\Support\PageSections\SectionRules;
use Illuminate\Foundation\Http\FormRequest;

/**
 * The console's unsaved-draft preview (`POST /admin/pages/preview`): the
 * sections as typed, checked by exactly the rules a save runs — sanitiser
 * included — and presented, and nothing written. `page_id` names the page
 * being edited, for a "this page's FAQs" section; a new page has none.
 */
class PreviewPageSectionsRequest extends FormRequest
{
    use SanitisesRichText, ValidatesPageSections;

    protected function richTextFields(): array
    {
        return ['blocks.*.data.body', 'blocks.*.data.columns.*.body'];
    }

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            ...$this->sectionRules(),
            'blocks' => ['present', 'array', 'max:'.SectionRules::MAX_SECTIONS],
            'page_id' => ['nullable', 'integer', 'exists:pages,id'],
        ];
    }

    public function messages(): array
    {
        return SectionRules::messages('blocks', $this->input('blocks'));
    }
}
