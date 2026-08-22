<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Brands carry no publish status and no SEO override.
 *
 * They are a filter facet on the product listing, not a page — there is no
 * /brands/{slug} route for them to have metadata for. The model has no HasSeo
 * trait, so adding `seo` here would validate a field nothing could store.
 */
class StoreBrandRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255', 'alpha_dash', Rule::unique('brands', 'slug')],
            // Plain text, not rich: it renders as a lede, never through Prose.
            'description' => ['nullable', 'string', 'max:2000'],
            'logo_path' => ['nullable', 'string', 'max:255'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:65535'],
            'is_featured' => ['boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'Give the brand a name.',
            'slug.alpha_dash' => 'A slug can contain letters, numbers, dashes and underscores only.',
            'slug.unique' => 'Another brand already uses that slug.',
        ];
    }
}
