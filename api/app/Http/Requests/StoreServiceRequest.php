<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use App\Http\Requests\Concerns\AcceptsCustomFields;
use App\Http\Requests\Concerns\CmsFieldRules;
use App\Http\Requests\Concerns\SanitisesRichText;
use App\Models\Service;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreServiceRequest extends FormRequest
{
    use AcceptsCustomFields, SanitisesRichText;

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
        return ['body', 'answer_blocks.*.detail'];
    }

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255', 'alpha_dash', Rule::unique('services', 'slug')],
            'summary' => ['nullable', 'string', 'max:500'],
            'body' => ['nullable', 'string'],
            'icon' => ['nullable', 'string', 'max:40'],
            // The tab it is drawn under; null is "Other services".
            'service_category_id' => ['nullable', 'integer', Rule::exists('service_categories', 'id')],
            // A picture the media library holds, the rule an entry's image
            // follows: a path nothing knows is a card that silently 404s.
            'image_path' => ['nullable', 'string', 'max:255', Rule::exists('media', 'path')->whereNull('deleted_at')],
            // The chips on its card — ".com · .in", "Microsoft 365". Tidied by
            // the model; the limits are the card's.
            'highlights' => ['sometimes', 'nullable', 'array', 'max:'.Service::HIGHLIGHTS_MAX],
            'highlights.*' => ['nullable', 'string', 'max:'.Service::HIGHLIGHT_LENGTH],
            'status' => ['required', Rule::enum(PublishStatus::class)],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:65535'],
            // Whether the mega menu may show it. Not the same question as
            // whether it is published: a live record can be deliberately kept
            // out of the navigation.
            'show_in_menu' => ['boolean'],

            ...CmsFieldRules::faqs(),
            ...CmsFieldRules::answerBlocks(),
            ...SeoRules::rules(),
            ...$this->customFieldRules(),
        ];
    }

    public function messages(): array
    {
        return [
            'title.required' => 'Give the service a title.',
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
