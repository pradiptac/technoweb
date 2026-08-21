<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use App\Http\Requests\Concerns\CmsFieldRules;
use App\Http\Requests\Concerns\SanitisesRichText;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreServiceRequest extends FormRequest
{
    use SanitisesRichText;

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255', 'alpha_dash', Rule::unique('services', 'slug')],
            'summary' => ['nullable', 'string', 'max:500'],
            'body' => ['nullable', 'string'],
            'icon' => ['nullable', 'string', 'max:40'],
            'status' => ['required', Rule::enum(PublishStatus::class)],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:65535'],

            ...CmsFieldRules::faqs(),
            ...SeoRules::rules(),
        ];
    }

    public function messages(): array
    {
        return [
            'title.required' => 'Give the service a title.',
            'slug.unique' => 'Another service already uses that slug.',
            'summary.max' => 'The summary is limited to 500 characters.',
            'faqs.*.question.required' => 'Every FAQ needs a question.',
            'faqs.*.answer.required' => 'Every FAQ needs an answer.',
        ];
    }
}
