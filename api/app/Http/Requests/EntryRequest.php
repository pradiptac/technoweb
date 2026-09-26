<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use App\Http\Requests\Concerns\AcceptsCustomFields;
use App\Http\Requests\Concerns\CmsFieldRules;
use App\Http\Requests\Concerns\SanitisesRichText;
use App\Models\ContentType;
use App\Models\Entry;
use App\Support\CustomFields\EntryTargets;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * One entry of a custom content type, written through
 * `/admin/content-types/{type}/entries`. One class for create and update.
 *
 * The slug is unique **within the type** — the table's index is
 * `(content_type_id, slug)` — and the custom fields are the type's own
 * (`entry:<type-slug>`), so both rules read the type from the route.
 */
class EntryRequest extends FormRequest
{
    use AcceptsCustomFields, SanitisesRichText;

    protected function customFieldTarget(): string
    {
        return EntryTargets::PREFIX.$this->type()->slug;
    }

    /**
     * `body` and every answer block's `detail` are rich text, cleaned before
     * validation like every body on the site.
     */
    protected function richTextFields(): array
    {
        return ['body', 'answer_blocks.*.detail'];
    }

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    private function type(): ContentType
    {
        /** @var ContentType $type */
        $type = $this->route('content_type');

        return $type;
    }

    public function rules(): array
    {
        $entry = $this->route('entry');
        $creating = ! $entry instanceof Entry;
        $required = $creating ? 'required' : 'sometimes';

        return [
            'title' => [$required, 'string', 'max:255'],
            'slug' => ['sometimes', 'nullable', 'string', 'max:255', 'alpha_dash',
                Rule::unique('entries', 'slug')
                    ->where('content_type_id', $this->type()->id)
                    ->ignore($entry instanceof Entry ? $entry->id : null)],
            'summary' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'body' => ['sometimes', 'nullable', 'string'],
            'image_path' => ['sometimes', 'nullable', 'string', 'max:255', Rule::exists('media', 'path')->whereNull('deleted_at')],
            'status' => [$required, Rule::enum(PublishStatus::class)],
            'published_at' => ['sometimes', 'nullable', 'date'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:100000'],

            ...CmsFieldRules::faqs(),
            ...CmsFieldRules::answerBlocks(),
            ...SeoRules::rules(),
            ...$this->customFieldRules(),
        ];
    }

    public function messages(): array
    {
        return [
            'title.required' => 'Give the entry a title.',
            'slug.alpha_dash' => 'A slug can contain letters, numbers, dashes and underscores only.',
            'slug.unique' => 'Another entry of this type already uses that slug.',
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
