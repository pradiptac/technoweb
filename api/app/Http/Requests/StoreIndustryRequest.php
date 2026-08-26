<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\CmsFieldRules;
use App\Http\Requests\Concerns\SanitisesRichText;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreIndustryRequest extends FormRequest
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
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255', 'alpha_dash', Rule::unique('industries', 'slug')],
            'summary' => ['nullable', 'string', 'max:500'],
            'body' => ['nullable', 'string'],
            'icon' => ['nullable', 'string', 'max:40'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:65535'],
            // Whether the mega menu may show it. Not the same question as
            // whether it is published: a live record can be deliberately kept
            // out of the navigation.
            'show_in_menu' => ['boolean'],

            // No status: industries have no such column. The set is a fixed
            // taxonomy the navigation keys off, not publishable content.

            ...CmsFieldRules::ids('solution_ids', 'solutions'),
            ...SeoRules::rules(),
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'Give the industry a name.',
            'slug.unique' => 'Another industry already uses that slug.',
            'summary.max' => 'The summary is limited to 500 characters.',
        ];
    }
}
