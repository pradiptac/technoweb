<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\SanitisesRichText;
use App\Http\Requests\Concerns\ValidatesPageSections;
use App\Support\DetailTemplates;
use App\Support\PageSections\SectionRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * A detail template (`POST|PATCH /admin/detail-templates`, 0.161.0): its
 * sections are checked by exactly the rules a page's are — the sanitiser, the
 * per-type rules, what a record's body area cannot hold — plus the record
 * blocks' own (`DetailTemplates::after`). `type` is fixed once saved: a
 * template moved to another kind of record would be placing blocks that kind
 * has no part for.
 *
 * Who may write is the controller's: the route is the union of the roles that
 * own a kind, and the kind decides which of them.
 */
class DetailTemplateRequest extends FormRequest
{
    use SanitisesRichText, ValidatesPageSections;

    protected function richTextFields(): array
    {
        return SectionRules::RICH_TEXT;
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
            'type' => $creating ? ['required', 'string', Rule::in(DetailTemplates::aliases())] : ['prohibited'],
            'name' => [$creating ? 'required' : 'sometimes', 'string', 'max:120'],
            'blocks' => [$creating ? 'required' : 'sometimes', 'array', 'min:1', 'max:'.SectionRules::MAX_SECTIONS],
        ];
    }

    public function messages(): array
    {
        return SectionRules::messages('blocks', $this->input('blocks'));
    }

    /** The kind these blocks are for: the request's on create, the stored template's on update. */
    public function templateType(): ?string
    {
        $type = $this->isMethod('POST') ? $this->input('type') : $this->route('detailTemplate')?->type;

        return is_string($type) && DetailTemplates::knows($type) ? $type : null;
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            // Not the trait's `withValidator`: it would refuse every record block. The template's own
            // check runs the page builder's rules with them allowed.
            $type = $this->templateType();
            if ($type !== null && $this->has('blocks')) {
                DetailTemplates::after($v, $type, $this->input('blocks'));
            }
        });
    }
}
