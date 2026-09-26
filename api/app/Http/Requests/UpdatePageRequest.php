<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use App\Http\Requests\Concerns\AcceptsCustomFields;
use App\Http\Requests\Concerns\CmsFieldRules;
use App\Http\Requests\Concerns\SanitisesRichText;
use App\Http\Requests\Concerns\ValidatesPageSections;
use App\Support\PageSections\SectionRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdatePageRequest extends FormRequest
{
    use AcceptsCustomFields, SanitisesRichText, ValidatesPageSections;

    protected function customFieldTarget(): string
    {
        return 'page';
    }

    /**
     * `body` is the rich-text body, as the trait's default says.
     * `answer_blocks.*.detail` is the supporting explanation under each
     * answer block, rich text like any body, and has to be named here or it
     * bypasses the sanitiser entirely. `blocks.*.data.body` is a builder
     * section's rich text (`rich_text`, `media_text`), cleaned the same way.
     */
    protected function richTextFields(): array
    {
        return ['body', 'answer_blocks.*.detail', 'blocks.*.data.body'];
    }

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'slug' => ['sometimes', 'required', 'string', 'max:255', 'alpha_dash',
                Rule::unique('pages', 'slug')->ignore($this->route('page'))],
            'body' => ['sometimes', 'nullable', 'string'],
            // An allowlist rather than a free string: the frontend can only
            // render the templates it has, and a value it does not know
            // would fall back silently — a page laid out the wrong way with
            // nothing anywhere saying why.
            'template' => ['sometimes', 'nullable', 'in:default,wide,builder'],
            'status' => ['sometimes', Rule::enum(PublishStatus::class)],
            'published_at' => ['sometimes', 'nullable', 'date'],

            // `blocks` — the builder's sections (2026-09-26). This comment used
            // to say the field was deliberately absent: the column was for
            // block-assembled pages, which needed a block editor rather than a
            // text field, and raw JSON typed into one would let a typo corrupt
            // a page with no way to see it. The section builder is that
            // editor — each section's fields validated by its type
            // (`SectionRules`), 422s keyed `blocks.N.data.field` — so the
            // objection is answered rather than overruled. `template` gains
            // `builder`, which renders the sections instead of the body.
            ...$this->sectionRules(),

            ...CmsFieldRules::faqs(),
            ...CmsFieldRules::answerBlocks(),
            ...SeoRules::rules(),
            ...$this->customFieldRules(),
        ];
    }

    public function messages(): array
    {
        return [
            'slug.alpha_dash' => 'A slug can contain letters, numbers, dashes and underscores only.',
            'slug.unique' => 'Another page already uses that slug.',
            'faqs.*.question.required' => 'Every FAQ needs a question.',
            'faqs.*.answer.required' => 'Every FAQ needs an answer.',
            'answer_blocks.*.kind.required' => 'Every answer block needs a kind.',
            'answer_blocks.*.answer.required' => 'Every answer block needs its direct answer.',
            'answer_blocks.*.answer.max' => 'The direct answer is limited to 600 characters. Put the rest in the detail.',
            'answer_blocks.*.question.required_if' => 'A question or comparison block needs its question.',
            ...SectionRules::messages(),
        ];
    }
}
