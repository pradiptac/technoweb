<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use App\Http\Requests\Concerns\SanitisesRichText;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreCaseStudyRequest extends FormRequest
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

            ...SeoRules::rules(),
        ];
    }

    public function messages(): array
    {
        return [
            'title.required' => 'Give the case study a title.',
            'slug.alpha_dash' => 'A slug can contain letters, numbers, dashes and underscores only.',
            'slug.unique' => 'Another case study already uses that slug.',
            'summary.max' => 'The summary is limited to 500 characters.',
            'results.*.value.required' => 'Every result needs a figure — the big number.',
            'results.*.label.required' => 'Every result needs a label saying what the figure measures.',
        ];
    }
}
