<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use App\Http\Requests\Concerns\AcceptsCustomFields;
use App\Http\Requests\Concerns\SanitisesRichText;
use App\Http\Requests\Concerns\ValidatesRecordSections;
use App\Support\PageSections\SectionRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreCaseStudyRequest extends FormRequest
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
            'title' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255', 'alpha_dash', Rule::unique('case_studies', 'slug')],
            'client_name' => ['nullable', 'string', 'max:255'],
            'summary' => ['nullable', 'string', 'max:500'],
            'body' => ['nullable', 'string'],
            'status' => ['required', Rule::enum(PublishStatus::class)],
            'industry_id' => ['nullable', 'integer', Rule::exists('industries', 'id')],
            'cover_image_path' => ['nullable', 'string', 'max:255'],

            // The headline stats — [{ value: "-71%", label: "Network tickets" }].
            // Capped because they render as a single row on the case-study page;
            // past four they wrap into something that reads worse than prose.
            'results' => ['sometimes', 'nullable', 'array', 'max:8'],
            'results.*.value' => ['required', 'string', 'max:40'],
            'results.*.label' => ['required', 'string', 'max:60'],

            // No published_at — case_studies has no such column. Status alone
            // decides whether one is live.

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
            'title.required' => 'Give the case study a title.',
            'slug.alpha_dash' => 'A slug can contain letters, numbers, dashes and underscores only.',
            'slug.unique' => 'Another case study already uses that slug.',
            'summary.max' => 'The summary is limited to 500 characters.',
            'results.*.value.required' => 'Every result needs a figure — the big number.',
            'results.*.label.required' => 'Every result needs a label saying what the figure measures.',
        ];
    }
}
