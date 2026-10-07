<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use App\Http\Requests\Concerns\AcceptsCustomFields;
use App\Http\Requests\Concerns\SanitisesRichText;
use App\Http\Requests\Concerns\ValidatesRecordSections;
use App\Support\PageSections\SectionRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCaseStudyRequest extends FormRequest
{
    use AcceptsCustomFields, SanitisesRichText, ValidatesRecordSections;

    protected function customFieldTarget(): string
    {
        return 'case_study';
    }

    /** `body`, as the trait's default says, and the rich text inside the builder's sections. */
    protected function richTextFields(): array
    {
        return ['body', ...SectionRules::RICH_TEXT];
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

            // Builder sections in place of the written body (0.129.0, `RecordSections`).
            ...$this->recordSectionRules(),
            ...SeoRules::rules(),

            ...$this->customFieldRules(),
        ];
    }

    public function messages(): array
    {
        return [
            ...$this->recordSectionMessages(),
            'slug.alpha_dash' => 'A slug can contain letters, numbers, dashes and underscores only.',
            'slug.unique' => 'Another case study already uses that slug.',
            'summary.max' => 'The summary is limited to 500 characters.',
            'results.*.value.required' => 'Every result needs a figure — the big number.',
            'results.*.label.required' => 'Every result needs a label saying what the figure measures.',
        ];
    }
}
