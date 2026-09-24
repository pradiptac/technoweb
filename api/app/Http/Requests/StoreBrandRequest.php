<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\CmsFieldRules;
use App\Http\Requests\Concerns\SanitisesRichText;
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
            'slug' => ['nullable', 'string', 'max:255', 'alpha_dash', Rule::unique('brands', 'slug')],
            // Plain text, not rich: it renders as a lede, never through Prose.
            'description' => ['nullable', 'string', 'max:2000'],
            'logo_path' => ['nullable', 'string', 'max:255'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:65535'],
            'is_featured' => ['boolean'],
            // "Gold Partner" and the like. Filled, it puts the logo on the
            // /certifications page's partner strip; blank means no claim.
            'partner_tier' => ['nullable', 'string', 'max:80'],

            ...CmsFieldRules::faqs(),
            ...CmsFieldRules::answerBlocks(),
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'Give the brand a name.',
            'slug.alpha_dash' => 'A slug can contain letters, numbers, dashes and underscores only.',
            'slug.unique' => 'Another brand already uses that slug.',
            'faqs.*.question.required' => 'Every FAQ needs a question.',
            'faqs.*.answer.required' => 'Every FAQ needs an answer.',
            'answer_blocks.*.kind.required' => 'Every answer block needs a kind.',
            'answer_blocks.*.answer.required' => 'Every answer block needs its direct answer.',
            'answer_blocks.*.answer.max' => 'The direct answer is limited to 600 characters. Put the rest in the detail.',
            'answer_blocks.*.question.required_if' => 'A question or comparison block needs its question.',
        ];
    }
}
