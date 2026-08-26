<?php

namespace App\Http\Requests;

use App\Enums\EmploymentType;
use App\Enums\PublishStatus;
use App\Http\Requests\Concerns\SanitisesRichText;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Creating a vacancy.
 *
 * `description` is editor HTML and is declared rich text below, which is what
 * puts it through `HtmlSanitiser` before validation ever sees it. A rich-text
 * field not declared there bypasses the sanitiser entirely — and this one ends
 * up in `Prose`, on a public page, via `dangerouslySetInnerHTML`.
 */
class StoreJobOpeningRequest extends FormRequest
{
    use SanitisesRichText;

    protected function richTextFields(): array
    {
        return ['description'];
    }

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:160'],
            'slug' => ['nullable', 'string', 'max:180', Rule::unique('job_openings', 'slug')],
            'department' => ['nullable', 'string', 'max:120'],
            'location' => ['nullable', 'string', 'max:160'],
            'employment_type' => ['required', Rule::in(EmploymentType::values())],
            'openings' => ['nullable', 'integer', 'min:1', 'max:999'],
            'job_experience_level_id' => ['nullable', 'integer', Rule::exists('job_experience_levels', 'id')],

            // Optional, and validated as a pair: a maximum below the minimum is
            // a typo that would otherwise be published as a salary band.
            'salary_min' => ['nullable', 'integer', 'min:0', 'max:100000000'],
            'salary_max' => ['nullable', 'integer', 'min:0', 'max:100000000', 'gte:salary_min'],
            'salary_period' => ['nullable', Rule::in(['year', 'month'])],
            'salary_currency' => ['nullable', 'string', 'size:3'],

            'summary' => ['nullable', 'string', 'max:500'],
            'description' => ['nullable', 'string'],
            'responsibilities' => ['nullable', 'array', 'max:30'],
            'responsibilities.*' => ['string', 'max:300'],
            'requirements' => ['nullable', 'array', 'max:30'],
            'requirements.*' => ['string', 'max:300'],

            'qualification_ids' => ['nullable', 'array', 'max:30'],
            'qualification_ids.*' => ['integer', Rule::exists('job_qualifications', 'id')],

            'status' => ['required', Rule::enum(PublishStatus::class)],
            'published_at' => ['nullable', 'date'],
            // Not `after:today` — an existing role being edited may legitimately
            // already have a past date, and refusing the save would trap it.
            'closes_at' => ['nullable', 'date'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:65535'],

            'seo' => ['nullable', 'array'],
        ];
    }

    public function messages(): array
    {
        return ['salary_max.gte' => 'The top of the range cannot be below the bottom of it.'];
    }

    /**
     * Just the columns.
     *
     * `preventSilentlyDiscardingAttributes` is on outside production, so
     * handing `update()` an array carrying `seo` or `qualification_ids` throws
     * rather than quietly ignoring them.
     */
    public function modelData(): array
    {
        $data = collect($this->safe()->except(['seo', 'qualification_ids']))->all();

        // Publishing without a date would leave the row published and invisible,
        // because the public scope filters on the date. Same rule as every other
        // entity that has the column.
        if (($data['status'] ?? null) === PublishStatus::Published->value && empty($data['published_at'])) {
            $data['published_at'] = now();
        }

        return $data;
    }
}
