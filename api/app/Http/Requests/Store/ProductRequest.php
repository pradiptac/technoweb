<?php

namespace App\Http\Requests\Store;

use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Http\Requests\Concerns\CmsFieldRules;
use App\Http\Requests\Concerns\SanitisesRichText;
use App\Http\Requests\SeoRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * One request for create and update, the shape the newer modules use.
 *
 * `sometimes` everywhere and a `$this->isMethod('post')` for the handful of
 * fields a creation cannot do without. Two classes for one form is two places
 * a rule can be added to only one of.
 *
 * **Money arrives in paise, as an integer**, because that is how it is stored —
 * see `App\Support\Money`. Accepting rupees with a decimal point would put a
 * float on the wire and a conversion at both ends, and the conversion is where
 * a price becomes 1179.9999. The console shows and collects rupees and converts
 * by parsing the text, never by multiplying.
 */
class ProductRequest extends FormRequest
{
    use SanitisesRichText;

    /**
     * `description` is the rich-text body. `short_description` is deliberately
     * not listed: it renders as escaped text on cards and as the meta
     * description, so it must stay plain.
     */
    protected function richTextFields(): array
    {
        // `activation_procedure` is rich text and must be declared here or it
        // bypasses the sanitiser entirely — it is rendered into an email and,
        // through the order page, into a browser.
        return ['description', 'activation_procedure'];
    }

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        /*
         * `storeProduct`, spelled exactly as `routes/api.php` declares it.
         *
         * It read `store_product` for as long as this module has existed, and
         * `$this->route()` answers null for a parameter no route has — so
         * `ignore(null)` ignored nothing, the uniqueness check counted the row
         * being edited as a conflict with itself, and **no store product could
         * be saved without also changing its slug**. It surfaced as "Another
         * store product already uses that slug" on a shop holding one product.
         *
         * Silent in exactly the way this project keeps being bitten by: two
         * hand-written strings on opposite sides of a boundary, agreeing with
         * nothing that checks them. `RouteParameterNamesTest` now compares
         * every one of them against the real route table.
         */
        $product = $this->route('storeProduct');
        $creating = $this->isMethod('post');
        $required = $creating ? 'required' : 'sometimes';

        return [
            'name' => [$required, 'string', 'max:255'],
            'slug' => [
                'sometimes', 'nullable', 'string', 'max:255', 'alpha_dash',
                Rule::unique('store_products', 'slug')->ignore($product),
            ],
            'sku' => ['sometimes', 'nullable', 'string', 'max:255'],
            'type' => [$required, Rule::enum(ProductType::class)],

            'store_category_id' => ['sometimes', 'nullable', 'integer', Rule::exists('store_categories', 'id')],
            'brand_id' => ['sometimes', 'nullable', 'integer', Rule::exists('brands', 'id')],

            'short_description' => ['sometimes', 'nullable', 'string', 'max:500'],
            'description' => ['sometimes', 'nullable', 'string'],
            'activation_procedure' => ['sometimes', 'nullable', 'string'],
            /*
             * A path the media library knows about, not any string.
             *
             * An unknown path is an attachment that silently fails to attach:
             * the email claims a procedure document and the customer receives a
             * message referring to something that is not there. Refused on write
             * for the same reason the campaign attachment is.
             */
            'activation_pdf_path' => [
                'sometimes', 'nullable', 'string', 'max:255',
                Rule::exists('media', 'path'),
            ],

            /*
             * A price is required to create one, and that is the whole of what
             * makes this table different from the catalogue: everything in here
             * is for sale, so there is no "sellable" flag to forget to tick and
             * no way to publish a Buy button with nothing behind it.
             *
             * One crore in paise as a ceiling — not a limit anybody will meet,
             * and a guard against a rupee figure arriving where paise were
             * expected.
             */
            'price_paise' => [$required, 'integer', 'min:0', 'max:1000000000'],
            'compare_at_paise' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:1000000000'],

            'track_stock' => ['sometimes', 'boolean'],
            'stock' => ['sometimes', 'integer', 'min:0', 'max:1000000'],
            'returnable' => ['sometimes', 'boolean'],

            'status' => [$required, Rule::enum(PublishStatus::class)],
            'is_featured' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:65535'],

            'images' => ['sometimes', 'nullable', 'array', 'max:12'],
            // The storable path, not a URL: the resource builds those with
            // asset(), so a stored URL breaks the day the site moves domain.
            'images.*' => ['string', 'max:255', 'not_regex:/^https?:\/\//i'],

            'specifications' => ['sometimes', 'nullable', 'array', 'max:40'],
            'specifications.*' => ['nullable', 'string', 'max:255'],

            /*
             * Variations are replaced wholesale, the rule `faqs` and `slides`
             * follow: omitting the key leaves them alone, sending `[]` clears
             * them — which has to be possible or the last one could never go.
             */
            'variations' => ['sometimes', 'nullable', 'array', 'max:50'],
            'variations.*.id' => ['sometimes', 'nullable', 'integer'],
            'variations.*.name' => ['required', 'string', 'max:120'],
            'variations.*.sku' => ['nullable', 'string', 'max:120'],
            'variations.*.options' => ['sometimes', 'nullable', 'array', 'max:6'],
            'variations.*.options.*' => ['nullable', 'string', 'max:120'],
            'variations.*.price_paise' => ['nullable', 'integer', 'min:0', 'max:1000000000'],
            'variations.*.stock' => ['sometimes', 'integer', 'min:0', 'max:1000000'],
            'variations.*.weight_grams' => ['nullable', 'integer', 'min:0', 'max:1000000'],
            'variations.*.image_path' => ['nullable', 'string', 'max:255', 'not_regex:/^https?:\/\//i'],
            'variations.*.is_active' => ['sometimes', 'boolean'],

            ...CmsFieldRules::stringList('features'),
            ...SeoRules::rules(),
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'name.required' => 'Give the product a name.',
            'price_paise.required' => 'Everything in the store has a price. Set one.',
            'slug.unique' => 'Another store product already uses that slug.',
            'images.*.not_regex' => 'Store the image path, not a full URL.',
            'variations.*.name.required' => 'Every variation needs a name — what the buyer picks from.',
            'variations.max' => 'A product can carry up to 50 variations.',
        ];
    }
}
