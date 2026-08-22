<?php

namespace App\Http\Requests;

use Illuminate\Validation\Rule;

/**
 * The product-shaped fields, shared by the store and update requests.
 *
 * Kept out of CmsFieldRules because nothing else in the CMS has a spec sheet
 * or an image gallery — putting them there would imply a generality that does
 * not exist.
 */
class ProductFieldRules
{
    /**
     * Specifications are a `{"Ports": "24 × 1G"}` map, not a list of rows.
     *
     * That is the shape the public product page already reads and the seeder
     * already writes, so the admin sends the same thing back rather than
     * introducing a second format that has to be converted at both ends.
     *
     * The cost is that keys cannot be validated by the usual `field.*` syntax,
     * hence the closure: an empty or overlong key would otherwise reach the
     * JSON column and render as a blank row on the site.
     */
    public static function specifications(): array
    {
        return [
            'specifications' => ['sometimes', 'nullable', 'array', 'max:40', self::validKeys()],
            'specifications.*' => ['nullable', 'string', 'max:255'],
        ];
    }

    private static function validKeys(): callable
    {
        return function (string $attribute, mixed $value, callable $fail) {
            if (! is_array($value)) {
                return;
            }

            foreach (array_keys($value) as $key) {
                $key = (string) $key;

                if (trim($key) === '') {
                    $fail('Every specification needs a label.');

                    return;
                }

                if (mb_strlen($key) > 80) {
                    $fail('A specification label is limited to 80 characters.');

                    return;
                }
            }
        };
    }

    /**
     * Gallery image paths, relative to the public disk — the same strings the
     * media endpoint returns. Full URLs are rejected: the resource builds
     * those with asset(), so storing one would break the moment the site
     * moves domain.
     */
    public static function images(): array
    {
        return [
            'images' => ['sometimes', 'nullable', 'array', 'max:12'],
            'images.*' => ['string', 'max:255', 'not_regex:/^https?:\/\//i'],
        ];
    }

    /** A product may not be listed as related to itself. */
    public static function notSelf(?int $id): callable
    {
        return function (string $attribute, mixed $value, callable $fail) use ($id) {
            if ($id !== null && is_array($value) && in_array($id, array_map('intval', $value), true)) {
                $fail('A product cannot be related to itself.');
            }
        };
    }

    /** @return array<string, string> */
    public static function messages(): array
    {
        return [
            'name.required' => 'Give the product a name.',
            'slug.alpha_dash' => 'A slug can contain letters, numbers, dashes and underscores only.',
            'slug.unique' => 'Another product already uses that slug.',
            'short_description.max' => 'The short description is limited to 500 characters.',
            'images.max' => 'A product can carry up to 12 images.',
            'images.*.not_regex' => 'Store the image path, not a full URL.',
            'specifications.max' => 'A spec sheet is limited to 40 rows.',
            'faqs.*.question.required' => 'Every FAQ needs a question.',
            'faqs.*.answer.required' => 'Every FAQ needs an answer.',
        ];
    }

    /** Kept here so both requests agree on what a brand/category id must be. */
    public static function relationIds(): array
    {
        return [
            'brand_id' => ['nullable', 'integer', Rule::exists('brands', 'id')],
            'product_category_id' => ['nullable', 'integer', Rule::exists('product_categories', 'id')],
        ];
    }
}
