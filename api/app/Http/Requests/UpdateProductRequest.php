<?php

namespace App\Http\Requests;

use App\Enums\ProductAvailability;
use App\Enums\PublishStatus;
use App\Http\Requests\Concerns\CmsFieldRules;
use App\Http\Requests\Concerns\SanitisesRichText;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateProductRequest extends FormRequest
{
    use SanitisesRichText;

    protected function richTextFields(): array
    {
        return ['description'];
    }

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $product = $this->route('product');

        return [
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'slug' => [
                'sometimes', 'nullable', 'string', 'max:255', 'alpha_dash',
                Rule::unique('products', 'slug')->ignore($product),
            ],
            'sku' => ['sometimes', 'nullable', 'string', 'max:255'],
            'brand_id' => ['sometimes', 'nullable', 'integer', Rule::exists('brands', 'id')],
            'product_category_id' => ['sometimes', 'nullable', 'integer', Rule::exists('product_categories', 'id')],
            'short_description' => ['sometimes', 'nullable', 'string', 'max:500'],
            'description' => ['sometimes', 'nullable', 'string'],
            'datasheet_path' => ['sometimes', 'nullable', 'string', 'max:255'],
            'status' => ['sometimes', 'required', Rule::enum(PublishStatus::class)],
            'is_featured' => ['sometimes', 'boolean'],
            /*
             * Whether the thing can actually be had. Feeds `availability` in the
             * product's `Offer`; nullable, and omitted from the markup when
             * nobody has said — a default of `InStock` would make every schema
             * block look complete and would be a claim about stock this business
             * has never tracked.
             */
            'availability' => ['sometimes', 'nullable', Rule::in(ProductAvailability::values())],
            'sort_order' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:65535'],

            ...ProductFieldRules::specifications(),
            ...CmsFieldRules::stringList('features'),
            ...ProductFieldRules::images(),
            ...CmsFieldRules::ids('solution_ids', 'solutions'),
            ...CmsFieldRules::ids('related_product_ids', 'products'),
            ...CmsFieldRules::faqs(),
            ...SeoRules::rules(),

            // Appended rather than replacing the ids() rule above, so a bad id
            // is still reported as "does not exist" before this runs.
            'related_product_ids' => array_merge(
                CmsFieldRules::ids('related_product_ids', 'products')['related_product_ids'],
                [ProductFieldRules::notSelf($product?->id)],
            ),
        ];
    }

    public function messages(): array
    {
        return ProductFieldRules::messages();
    }
}
