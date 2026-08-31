<?php

namespace App\Http\Requests\Store;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * The store's own taxonomy. Flat, small, and plain text throughout —
 * a category description is a line under a heading, not a page.
 */
class CategoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $category = $this->route('store_category');
        $required = $this->isMethod('post') ? 'required' : 'sometimes';

        return [
            'name' => [$required, 'string', 'max:120'],
            'slug' => [
                'sometimes', 'nullable', 'string', 'max:160', 'alpha_dash',
                Rule::unique('store_categories', 'slug')->ignore($category),
            ],
            'description' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'image_path' => ['sometimes', 'nullable', 'string', 'max:255', 'not_regex:/^https?:\/\//i'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:65535'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'name.required' => 'Give the category a name.',
            'slug.unique' => 'Another store category already uses that slug.',
            'image_path.not_regex' => 'Store the image path, not a full URL.',
        ];
    }
}
