<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\CmsFieldRules;
use App\Http\Requests\Concerns\SanitisesRichText;
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
    use SanitisesRichText;

    /**
     * No rich-text body of its own: the description is plain text.
     * `answer_blocks.*.detail` is the supporting explanation under each
     * answer block, rich text like any body, and has to be named here or it
     * bypasses the sanitiser entirely.
     */
    protected function richTextFields(): array
    {
        return ['answer_blocks.*.detail'];
    }

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
            'image_path' => ['nullable', 'string', 'max:255'],
            'parent_id' => ['nullable', 'integer', Rule::exists('product_categories', 'id')],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:65535'],
            // Whether the mega menu may show it. Not the same question as
            // whether it is published: a live record can be deliberately kept
            // out of the navigation.
            'show_in_menu' => ['boolean'],

            ...CmsFieldRules::faqs(),
            ...CmsFieldRules::answerBlocks(),
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
            'faqs.*.question.required' => 'Every FAQ needs a question.',
            'faqs.*.answer.required' => 'Every FAQ needs an answer.',
            'answer_blocks.*.kind.required' => 'Every answer block needs a kind.',
            'answer_blocks.*.answer.required' => 'Every answer block needs its direct answer.',
            'answer_blocks.*.answer.max' => 'The direct answer is limited to 600 characters. Put the rest in the detail.',
            'answer_blocks.*.question.required_if' => 'A question or comparison block needs its question.',
        ];
    }
}
