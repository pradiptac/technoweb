<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Product categories have no publish status.
 *
 * Like industries, the set is a taxonomy the navigation and the product
 * listing both key off, not a stream of publishable content — there is no
 * meaningful "draft category". Deleting one is how you take it off the site,
 * and products survive that (product_category_id is nullOnDelete).
 */
class StoreProductCategoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255', 'alpha_dash', Rule::unique('product_categories', 'slug')],
            // Plain text: it renders as the hero lede, never through Prose.
            'description' => ['nullable', 'string', 'max:2000'],
            'icon' => ['nullable', 'string', 'max:40'],
            'parent_id' => ['nullable', 'integer', Rule::exists('product_categories', 'id')],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:65535'],
            // Whether the mega menu may show it. Not the same question as
            // whether it is published: a live record can be deliberately kept
            // out of the navigation.
            'show_in_menu' => ['boolean'],

            ...SeoRules::rules(),
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'Give the category a name.',
            'slug.alpha_dash' => 'A slug can contain letters, numbers, dashes and underscores only.',
            'slug.unique' => 'Another category already uses that slug.',
            'parent_id.exists' => 'That parent category no longer exists.',
        ];
    }
}
