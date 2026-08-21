<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use App\Http\Requests\Concerns\CmsFieldRules;
use App\Http\Requests\Concerns\SanitisesRichText;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreSolutionRequest extends FormRequest
{
    use SanitisesRichText;

    /** `overview` is the rich-text body here, not `body`. */
    protected function richTextFields(): array
    {
        return ['overview'];
    }

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255', 'alpha_dash', Rule::unique('solutions', 'slug')],
            'summary' => ['nullable', 'string', 'max:500'],
            // Plain prose, deliberately not rich text — it renders as a lede.
            'problem_statement' => ['nullable', 'string', 'max:2000'],
            'overview' => ['nullable', 'string'],
            'icon' => ['nullable', 'string', 'max:40'],
            'hero_image_path' => ['nullable', 'string', 'max:255'],
            'status' => ['required', Rule::enum(PublishStatus::class)],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:65535'],

            ...CmsFieldRules::stringList('benefits'),
            ...CmsFieldRules::stringList('technologies', 30, 60),
            ...CmsFieldRules::ids('product_ids', 'products'),
            ...CmsFieldRules::ids('industry_ids', 'industries'),
            ...CmsFieldRules::faqs(),
            ...SeoRules::rules(),
        ];
    }

    public function messages(): array
    {
        return [
            'title.required' => 'Give the solution a title.',
            'slug.alpha_dash' => 'A slug can contain letters, numbers, dashes and underscores only.',
            'slug.unique' => 'Another solution already uses that slug.',
            'summary.max' => 'The summary is limited to 500 characters.',
            'faqs.*.question.required' => 'Every FAQ needs a question.',
            'faqs.*.answer.required' => 'Every FAQ needs an answer.',
        ];
    }
}
