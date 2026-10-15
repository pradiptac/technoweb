<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use App\Http\Requests\Concerns\AcceptsCustomFields;
use App\Http\Requests\Concerns\CmsFieldRules;
use App\Http\Requests\Concerns\SanitisesRichText;
use App\Http\Requests\Concerns\ValidatesRecordSections;
use App\Support\PageSections\SectionRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreBlogPostRequest extends FormRequest
{
    use AcceptsCustomFields, SanitisesRichText, ValidatesRecordSections;

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
        return ['body', 'answer_blocks.*.detail', ...SectionRules::RICH_TEXT];
    }

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
            // Nullable so Sluggable can derive it; unique when supplied.
            'slug' => ['nullable', 'string', 'max:255', 'alpha_dash', Rule::unique('blog_posts', 'slug')],
            'excerpt' => ['nullable', 'string', 'max:500'],
            'body' => ['nullable', 'string'],
            'status' => ['required', Rule::enum(PublishStatus::class)],
            'published_at' => ['nullable', 'date'],
            'author_id' => ['nullable', 'integer', Rule::exists('users', 'id')->where('is_active', true)],
            'cover_image_path' => ['nullable', 'string', 'max:255'],
            'is_featured' => ['sometimes', 'boolean'],
            'comments_enabled' => ['sometimes', 'boolean'],
            /*
             * Replaced wholesale, like every other relation here: omitting the
             * key leaves the categories alone, sending `[]` clears them. Each
             * id is checked to exist, because a category deleted in another tab
             * would otherwise write a pivot row pointing at nothing.
             */
            'category_ids' => ['sometimes', 'array'],
            'category_ids.*' => ['integer', Rule::exists('blog_categories', 'id')],

            // reading_minutes is deliberately absent — the model derives it on
            // save, so accepting it here would let a client contradict itself.

            ...CmsFieldRules::faqs(),
            ...CmsFieldRules::answerBlocks(),
            // Builder sections in place of the written body (0.130.0, `RecordSections`).
            ...$this->recordSectionRules(),
            ...SeoRules::rules(),
            ...$this->customFieldRules(),
        ];
    }

    public function messages(): array
    {
        return [
            ...$this->recordSectionMessages(),
            'title.required' => 'Give the post a title.',
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
