<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use App\Http\Requests\Concerns\AcceptsCustomFields;
use App\Http\Requests\Concerns\CmsFieldRules;
use App\Http\Requests\Concerns\SanitisesRichText;
use App\Http\Requests\Concerns\ValidatesRecordSections;
use App\Models\Service;
use App\Support\PageSections\SectionRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateServiceRequest extends FormRequest
{
    use AcceptsCustomFields, SanitisesRichText, ValidatesRecordSections;

    protected function customFieldTarget(): string
    {
        return 'service';
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
                Rule::unique('services', 'slug')->ignore($this->route('service'))],
            'summary' => ['sometimes', 'nullable', 'string', 'max:500'],
            'body' => ['sometimes', 'nullable', 'string'],
            'icon' => ['sometimes', 'nullable', 'string', 'max:40'],
            // The tab it is drawn under; null is "Other services".
            'service_category_id' => ['sometimes', 'nullable', 'integer', Rule::exists('service_categories', 'id')],
            // A picture the media library holds, the rule an entry's image
            // follows: a path nothing knows is a card that silently 404s.
            'image_path' => ['sometimes', 'nullable', 'string', 'max:255', Rule::exists('media', 'path')->whereNull('deleted_at')],
            // The chips on its card — ".com · .in", "Microsoft 365". Tidied by
            // the model; the limits are the card's.
            'highlights' => ['sometimes', 'nullable', 'array', 'max:'.Service::HIGHLIGHTS_MAX],
            'highlights.*' => ['nullable', 'string', 'max:'.Service::HIGHLIGHT_LENGTH],
            'status' => ['sometimes', Rule::enum(PublishStatus::class)],
            'sort_order' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:65535'],
            'show_in_menu' => ['sometimes', 'boolean'],

            ...CmsFieldRules::faqs(),
            ...CmsFieldRules::answerBlocks(),
            // Builder sections in place of the written body (0.129.0, `RecordSections`).
            ...$this->recordSectionRules(),
            ...SeoRules::rules(),
            ...$this->customFieldRules(),
        ];
    }

    public function messages(): array
    {
        return [
            ...$this->recordSectionMessages(),
            'slug.unique' => 'Another service already uses that slug.',
            'summary.max' => 'The summary is limited to 500 characters.',
            'service_category_id.exists' => 'That service category no longer exists.',
            'image_path.exists' => 'That picture is not in the media library.',
            'faqs.*.question.required' => 'Every FAQ needs a question.',
            'faqs.*.answer.required' => 'Every FAQ needs an answer.',
            'answer_blocks.*.kind.required' => 'Every answer block needs a kind.',
            'answer_blocks.*.answer.required' => 'Every answer block needs its direct answer.',
            'answer_blocks.*.answer.max' => 'The direct answer is limited to 600 characters. Put the rest in the detail.',
            'answer_blocks.*.question.required_if' => 'A question or comparison block needs its question.',
        ];
    }
}
