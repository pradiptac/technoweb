<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use App\Http\Requests\Concerns\CmsFieldRules;
use App\Http\Requests\Concerns\SanitisesRichText;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreProductRequest extends FormRequest
{
    use SanitisesRichText;

    /**
     * `description` is the rich-text body. `short_description` is deliberately
     * not listed: it renders as escaped text on cards and as the meta
     * description, so it must stay plain.
     */
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
        return [
            'name' => ['required', 'string', 'max:255'],
            // withTrashed is not an option here: the column is uniquely
            // indexed, so a slug held by a soft-deleted product would pass
            // validation and then fail at the database. ProductController
            // releases the slug on delete instead.
            'slug' => ['nullable', 'string', 'max:255', 'alpha_dash', Rule::unique('products', 'slug')],
            'sku' => ['nullable', 'string', 'max:255'],
            'brand_id' => ['nullable', 'integer', Rule::exists('brands', 'id')],
            'product_category_id' => ['nullable', 'integer', Rule::exists('product_categories', 'id')],
            'short_description' => ['nullable', 'string', 'max:500'],
            'description' => ['nullable', 'string'],
            'datasheet_path' => ['nullable', 'string', 'max:255'],
            'status' => ['required', Rule::enum(PublishStatus::class)],
            'is_featured' => ['boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:65535'],

            ...ProductFieldRules::specifications(),
            ...CmsFieldRules::stringList('features'),
            ...ProductFieldRules::images(),
            ...CmsFieldRules::ids('solution_ids', 'solutions'),
            ...CmsFieldRules::ids('related_product_ids', 'products'),
            ...CmsFieldRules::faqs(),
            ...SeoRules::rules(),
        ];
    }

    public function messages(): array
    {
        return ProductFieldRules::messages();
    }
}
