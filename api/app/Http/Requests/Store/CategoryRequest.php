<?php

namespace App\Http\Requests\Store;

use App\Http\Requests\SeoRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * The store's own taxonomy. Flat, small, and plain text throughout — that
 * part still holds, and is why there is no `body` and no rich text here.
 *
 * It does carry `SeoRules` now: a category with something in it is a real
 * page at `/store/categories/{slug}`, in the sitemap with its own canonical,
 * and indistinguishable in that respect from `ProductCategory`, which has
 * had this from the start. "Not a page" was the wrong test — the right one,
 * which `ProductCategory`'s own comment already draws, is whether it carries
 * a `status` a draft can sit behind. It does not, for the same reason:
 * deleting a category is how you take it off the site.
 */
class CategoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        // `storeCategory`, as `routes/api.php` spells it — see the note in
        // `ProductRequest`. This one had the same typo and the same effect: a
        // category could not be saved without changing its slug.
        $category = $this->route('storeCategory');
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

            ...SeoRules::rules(),
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
