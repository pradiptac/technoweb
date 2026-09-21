<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\CmsFieldRules;
use App\Http\Requests\Concerns\SanitisesRichText;
use App\Models\ProductCategory;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateProductCategoryRequest extends FormRequest
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
        $category = $this->route('product_category');

        return [
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'slug' => [
                'sometimes', 'nullable', 'string', 'max:255', 'alpha_dash',
                Rule::unique('product_categories', 'slug')->ignore($category),
            ],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'icon' => ['sometimes', 'nullable', 'string', 'max:40'],
            'image_path' => ['sometimes', 'nullable', 'string', 'max:255'],
            'parent_id' => [
                'sometimes', 'nullable', 'integer',
                Rule::exists('product_categories', 'id'),
                $this->notItsOwnAncestor($category),
            ],
            'sort_order' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:65535'],
            'show_in_menu' => ['sometimes', 'boolean'],

            ...CmsFieldRules::faqs(),
            ...CmsFieldRules::answerBlocks(),
            ...SeoRules::rules(),
        ];
    }

    /**
     * A category may not be reparented under itself or one of its own
     * descendants. Either would cut that branch out of the tree: the loop
     * would still be walkable from inside itself but unreachable from a root,
     * so the whole subtree would vanish from the navigation with no error and
     * no obvious way to get it back.
     */
    private function notItsOwnAncestor(?ProductCategory $category): callable
    {
        return function (string $attribute, mixed $value, callable $fail) use ($category) {
            if ($category === null || $value === null) {
                return;
            }

            if ((int) $value === $category->id) {
                $fail('A category cannot be its own parent.');

                return;
            }

            if (in_array((int) $value, $category->descendantIds(), true)) {
                $fail('That category sits underneath this one, so it cannot also be its parent.');
            }
        };
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
