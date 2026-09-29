<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * A service category, created or edited (`POST` and `PATCH`).
 *
 * Taxonomy: no status, no body, no SEO. The description is plain text — it is
 * drawn as a line under the tab, never through `Prose` — so nothing here is
 * rich text and nothing needs the sanitiser.
 */
class ServiceCategoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $creating = $this->isMethod('POST');
        $sometimes = $creating ? [] : ['sometimes'];

        return [
            'name' => [...$sometimes, 'required', 'string', 'max:255'],
            'slug' => [
                ...$sometimes, 'nullable', 'string', 'max:255', 'alpha_dash',
                Rule::unique('service_categories', 'slug')->ignore($this->route('service_category')),
            ],
            'description' => [...$sometimes, 'nullable', 'string', 'max:1000'],
            'icon' => [...$sometimes, 'nullable', 'string', 'max:40'],
            'sort_order' => [...$sometimes, 'nullable', 'integer', 'min:0', 'max:65535'],
            'image_background' => [...$sometimes, 'boolean'],
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
            'slug.alpha_dash' => 'A slug can contain letters, numbers, dashes and underscores only.',
            'slug.unique' => 'Another service category already uses that slug.',
            'description.max' => 'The description is limited to 1,000 characters.',
        ];
    }
}
