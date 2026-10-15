<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * A download category, created or edited (`POST` and `PATCH`).
 *
 * Taxonomy: no status and no SEO. The description is plain text, drawn as a
 * line under the category's heading and never through `Prose`.
 */
class DownloadCategoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $sometimes = $this->isMethod('POST') ? [] : ['sometimes'];

        return [
            'name' => [...$sometimes, 'required', 'string', 'max:120'],
            'slug' => [
                ...$sometimes, 'nullable', 'string', 'max:140', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/',
                Rule::unique('download_categories', 'slug')->ignore($this->route('download_category')),
            ],
            'description' => [...$sometimes, 'nullable', 'string', 'max:500'],
            'sort_order' => [...$sometimes, 'nullable', 'integer', 'min:0', 'max:65535'],
            'is_active' => [...$sometimes, 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.required' => 'Give the category a name.',
            'slug.regex' => 'A slug is lower-case letters, numbers and single dashes.',
            'slug.unique' => 'Another download category already uses that slug.',
            'description.max' => 'The description is limited to 500 characters.',
        ];
    }
}
