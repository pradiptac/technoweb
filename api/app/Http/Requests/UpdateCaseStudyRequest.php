<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use App\Http\Requests\Concerns\SanitisesRichText;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCaseStudyRequest extends FormRequest
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
                Rule::unique('case_studies', 'slug')->ignore($this->route('case_study'))],
            'client_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'summary' => ['sometimes', 'nullable', 'string', 'max:500'],
            'body' => ['sometimes', 'nullable', 'string'],
            'status' => ['sometimes', Rule::enum(PublishStatus::class)],
            'industry_id' => ['sometimes', 'nullable', 'integer', Rule::exists('industries', 'id')],
            'cover_image_path' => ['sometimes', 'nullable', 'string', 'max:255'],

            'results' => ['sometimes', 'nullable', 'array', 'max:8'],
            'results.*.value' => ['required', 'string', 'max:40'],
            'results.*.label' => ['required', 'string', 'max:60'],

            ...SeoRules::rules(),
        ];
    }

    public function messages(): array
    {
        return [
            'slug.alpha_dash' => 'A slug can contain letters, numbers, dashes and underscores only.',
            'slug.unique' => 'Another case study already uses that slug.',
            'summary.max' => 'The summary is limited to 500 characters.',
            'results.*.value.required' => 'Every result needs a figure — the big number.',
            'results.*.label.required' => 'Every result needs a label saying what the figure measures.',
        ];
    }
}
