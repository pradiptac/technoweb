<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * One request for create and update.
 *
 * The `sometimes` on every rule is what makes a PATCH a partial update: a
 * field the console did not send is left alone rather than validated as
 * missing.
 */
class BlogCategoryRequest extends FormRequest
{
    public function rules(): array
    {
        $creating = $this->isMethod('POST');

        return [
            'name' => [$creating ? 'required' : 'sometimes', 'string', 'max:120'],
            /*
             * Optional, because `Sluggable` derives one from the name. Unique
             * across the table and ignoring this record, or editing a category
             * without touching its slug would fail against itself.
             *
             * The route parameter is `blog_category`, matching the binding in
             * `routes/api.php`. `$this->route('blogCategory')` would return
             * **null** for a parameter no route declares, and
             * `Rule::unique()->ignore(null)` ignores nothing — so every update
             * would collide with itself. That exact typo stopped the store
             * saving any product, and there is a guard test for it now.
             */
            'slug' => [
                'sometimes', 'nullable', 'string', 'max:140', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/',
                Rule::unique('blog_categories', 'slug')->ignore($this->route('blog_category')),
            ],
            'description' => ['sometimes', 'nullable', 'string', 'max:500'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:9999'],
        ];
    }

    public function messages(): array
    {
        return [
            'slug.regex' => 'A slug is lower-case letters, numbers and single hyphens.',
        ];
    }
}
