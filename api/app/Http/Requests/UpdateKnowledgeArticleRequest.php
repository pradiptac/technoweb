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

class UpdateKnowledgeArticleRequest extends FormRequest
{
    use AcceptsCustomFields, SanitisesRichText, ValidatesRecordSections;

    protected function customFieldTarget(): string
    {
        return 'knowledge_article';
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
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'slug' => ['sometimes', 'required', 'string', 'max:255', 'alpha_dash',
                Rule::unique('knowledge_articles', 'slug')->ignore($this->route('knowledge_article'))],
            'excerpt' => ['sometimes', 'nullable', 'string', 'max:500'],
            'body' => ['sometimes', 'nullable', 'string'],
            'status' => ['sometimes', Rule::enum(PublishStatus::class)],
            'published_at' => ['sometimes', 'nullable', 'date'],
            'knowledge_category_id' => ['sometimes', 'nullable', 'integer', Rule::exists('knowledge_categories', 'id')],

            'tags' => ['sometimes', 'array', 'max:20'],
            'tags.*' => ['string', 'max:40'],

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
            'slug.alpha_dash' => 'A slug can contain letters, numbers, dashes and underscores only.',
            'slug.unique' => 'Another article already uses that slug.',
            'excerpt.max' => 'The excerpt is limited to 500 characters.',
            'tags.max' => 'Twenty tags is plenty — more makes search worse, not better.',
            'faqs.*.question.required' => 'Every FAQ needs a question.',
            'faqs.*.answer.required' => 'Every FAQ needs an answer.',
            'answer_blocks.*.kind.required' => 'Every answer block needs a kind.',
            'answer_blocks.*.answer.required' => 'Every answer block needs its direct answer.',
            'answer_blocks.*.answer.max' => 'The direct answer is limited to 600 characters. Put the rest in the detail.',
            'answer_blocks.*.question.required_if' => 'A question or comparison block needs its question.',
        ];
    }
}
