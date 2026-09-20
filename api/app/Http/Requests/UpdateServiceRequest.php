<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use App\Http\Requests\Concerns\CmsFieldRules;
use App\Http\Requests\Concerns\SanitisesRichText;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateServiceRequest extends FormRequest
{
    use SanitisesRichText;

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'slug' => ['sometimes', 'required', 'string', 'max:255', 'alpha_dash',
                Rule::unique('services', 'slug')->ignore($this->route('service'))],
            'summary' => ['sometimes', 'nullable', 'string', 'max:500'],
            'body' => ['sometimes', 'nullable', 'string'],
            'icon' => ['sometimes', 'nullable', 'string', 'max:40'],
            'status' => ['sometimes', Rule::enum(PublishStatus::class)],
            'sort_order' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:65535'],
            'show_in_menu' => ['sometimes', 'boolean'],

            ...CmsFieldRules::faqs(),
            ...SeoRules::rules(),
        ];
    }

    public function messages(): array
    {
        return [
            'slug.unique' => 'Another service already uses that slug.',
            'summary.max' => 'The summary is limited to 500 characters.',
            'faqs.*.question.required' => 'Every FAQ needs a question.',
            'faqs.*.answer.required' => 'Every FAQ needs an answer.',
        ];
    }
}
