<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use App\Http\Requests\Concerns\AcceptsCustomFields;
use App\Http\Requests\Concerns\CmsFieldRules;
use App\Http\Requests\Concerns\SanitisesRichText;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateBlogPostRequest extends FormRequest
{
    use AcceptsCustomFields, SanitisesRichText;

    protected function customFieldTarget(): string
    {
        return 'blog_post';
    }

    /**
     * `body` is the rich-text body, as the trait's default says.
     * `answer_blocks.*.detail` is the supporting explanation under each
     * answer block, rich text like any body, and has to be named here or it
     * bypasses the sanitiser entirely.
     */
    protected function richTextFields(): array
    {
        return ['body', 'answer_blocks.*.detail'];
    }

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            // ignore() on the bound post, or saving a post without touching
            // its slug would collide with itself.
            'slug' => ['sometimes', 'required', 'string', 'max:255', 'alpha_dash',
                Rule::unique('blog_posts', 'slug')->ignore($this->route('blog_post'))],
            'excerpt' => ['sometimes', 'nullable', 'string', 'max:500'],
            'body' => ['sometimes', 'nullable', 'string'],
            'status' => ['sometimes', Rule::enum(PublishStatus::class)],
            'published_at' => ['sometimes', 'nullable', 'date'],
            'author_id' => ['sometimes', 'nullable', 'integer', Rule::exists('users', 'id')->where('is_active', true)],
            'cover_image_path' => ['sometimes', 'nullable', 'string', 'max:255'],
            'is_featured' => ['sometimes', 'boolean'],
            /*
             * Replaced wholesale, like every other relation here: omitting the
             * key leaves the categories alone, sending `[]` clears them. Each
             * id is checked to exist, because a category deleted in another tab
             * would otherwise write a pivot row pointing at nothing.
             */
            'category_ids' => ['sometimes', 'array'],
            'category_ids.*' => ['integer', Rule::exists('blog_categories', 'id')],

            ...CmsFieldRules::faqs(),
            ...CmsFieldRules::answerBlocks(),
            ...SeoRules::rules(),
            ...$this->customFieldRules(),
        ];
    }

    public function messages(): array
    {
        return [
            'slug.alpha_dash' => 'A slug can contain letters, numbers, dashes and underscores only.',
            'slug.unique' => 'Another post already uses that slug.',
            'excerpt.max' => 'The excerpt is limited to 500 characters.',
            'seo.description.max' => 'A meta description over 320 characters will be truncated by search engines.',
            'faqs.*.question.required' => 'Every FAQ needs a question.',
            'faqs.*.answer.required' => 'Every FAQ needs an answer.',
            'answer_blocks.*.kind.required' => 'Every answer block needs a kind.',
            'answer_blocks.*.answer.required' => 'Every answer block needs its direct answer.',
            'answer_blocks.*.answer.max' => 'The direct answer is limited to 600 characters. Put the rest in the detail.',
            'answer_blocks.*.question.required_if' => 'A question or comparison block needs its question.',
        ];
    }
}
