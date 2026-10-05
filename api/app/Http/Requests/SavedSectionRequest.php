<?php

namespace App\Http\Requests;

use App\Enums\PageSectionType;
use App\Http\Requests\Concerns\SanitisesRichText;
use App\Http\Requests\Concerns\ValidatesPageSections;
use App\Models\SavedSection;
use App\Support\PageSections\SectionRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * A library item (`POST|PATCH /admin/saved-sections`, docs/page-builder.md
 * "The library"): its sections are checked by exactly the rules a page's are
 * — the sanitiser, the per-type rules, `SectionRules::after` — plus two of
 * its own. A `section` is one section, and it is never itself a link to
 * another (one level, so a link can always be drawn). A `template` may place
 * linked sections; they are copied as links when a page starts from it.
 *
 * `kind` is fixed once saved: a section turned into a template would leave
 * every page that links it pointing at something it cannot draw.
 */
class SavedSectionRequest extends FormRequest
{
    use SanitisesRichText, ValidatesPageSections {
        ValidatesPageSections::withValidator as sectionsAfter;
    }

    protected function richTextFields(): array
    {
        return ['blocks.*.data.body'];
    }

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $creating = $this->isMethod('POST');

        return [
            ...$this->sectionRules(),
            'kind' => $creating
                ? ['required', Rule::in([SavedSection::KIND_SECTION, SavedSection::KIND_TEMPLATE])]
                : ['prohibited'],
            'name' => [$creating ? 'required' : 'sometimes', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:300'],
            'blocks' => [$creating ? 'required' : 'sometimes', 'array', 'min:1', 'max:'.SectionRules::MAX_SECTIONS],
        ];
    }

    public function messages(): array
    {
        return SectionRules::messages();
    }

    public function withValidator(Validator $validator): void
    {
        $this->sectionsAfter($validator);

        $validator->after(function (Validator $v) {
            $blocks = $this->input('blocks');
            if (! is_array($blocks)) {
                return;
            }
            $kind = $this->isMethod('POST')
                ? $this->input('kind')
                : $this->route('savedSection')?->kind;

            if ($kind === SavedSection::KIND_SECTION) {
                if (count($blocks) !== 1) {
                    $v->errors()->add('blocks', 'A saved section is one section.');
                }
                if (($blocks[0]['type'] ?? null) === PageSectionType::Saved->value) {
                    $v->errors()->add('blocks.0.type', 'A saved section cannot itself be a link to another.');
                }
            }
        });
    }
}
