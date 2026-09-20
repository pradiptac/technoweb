<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\CmsFieldRules;
use App\Http\Requests\Concerns\SanitisesRichText;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateIndustryRequest extends FormRequest
{
    use SanitisesRichText;

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            // `name`, not `title` — this model's slug derives from name.
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'slug' => ['sometimes', 'required', 'string', 'max:255', 'alpha_dash',
                Rule::unique('industries', 'slug')->ignore($this->route('industry'))],
            'summary' => ['sometimes', 'nullable', 'string', 'max:500'],
            'body' => ['sometimes', 'nullable', 'string'],
            'icon' => ['sometimes', 'nullable', 'string', 'max:40'],
            'sort_order' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:65535'],
            'show_in_menu' => ['sometimes', 'boolean'],

            // No status: industries have no such column. The set is a fixed
            // taxonomy the navigation keys off, not publishable content.

            ...CmsFieldRules::ids('solution_ids', 'solutions'),
            ...SeoRules::rules(),
        ];
    }

    public function messages(): array
    {
        return [
            'slug.unique' => 'Another industry already uses that slug.',
            'summary.max' => 'The summary is limited to 500 characters.',
        ];
    }
}
