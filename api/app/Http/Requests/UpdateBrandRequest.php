<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\CmsFieldRules;
use App\Http\Requests\Concerns\SanitisesRichText;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateBrandRequest extends FormRequest
{
    use SanitisesRichText;

    /**
     * No rich-text body of its own: the description is plain text.
     * `answer_blocks.*.detail` is the supporting explanation under each
     * answer block, rich text like any body, and has to be named here or it
     * bypasses the sanitiser entirely.
     */
    protected function richTextFields(): array
    {
        return ['answer_blocks.*.detail'];
    }

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'slug' => [
                'sometimes', 'nullable', 'string', 'max:255', 'alpha_dash',
                Rule::unique('brands', 'slug')->ignore($this->route('brand')),
            ],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'logo_path' => ['sometimes', 'nullable', 'string', 'max:255'],
            'sort_order' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:65535'],
            'is_featured' => ['sometimes', 'boolean'],
            'partner_tier' => ['sometimes', 'nullable', 'string', 'max:80'],

            ...CmsFieldRules::faqs(),
            ...CmsFieldRules::answerBlocks(),
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'Give the brand a name.',
            'slug.alpha_dash' => 'A slug can contain letters, numbers, dashes and underscores only.',
            'slug.unique' => 'Another brand already uses that slug.',
            'faqs.*.question.required' => 'Every FAQ needs a question.',
            'faqs.*.answer.required' => 'Every FAQ needs an answer.',
            'answer_blocks.*.kind.required' => 'Every answer block needs a kind.',
            'answer_blocks.*.answer.required' => 'Every answer block needs its direct answer.',
            'answer_blocks.*.answer.max' => 'The direct answer is limited to 600 characters. Put the rest in the detail.',
            'answer_blocks.*.question.required_if' => 'A question or comparison block needs its question.',
        ];
    }
}
