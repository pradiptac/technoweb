<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use App\Http\Requests\Concerns\SanitisesRichText;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdatePageRequest extends FormRequest
{
    use SanitisesRichText;

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'slug' => ['sometimes', 'required', 'string', 'max:255', 'alpha_dash',
                Rule::unique('pages', 'slug')->ignore($this->route('page'))],
            'body' => ['sometimes', 'nullable', 'string'],
            'template' => ['sometimes', 'nullable', 'string', 'max:40'],
            'status' => ['sometimes', Rule::enum(PublishStatus::class)],
            'published_at' => ['sometimes', 'nullable', 'date'],

            // `blocks` is deliberately absent. The column exists for
            // block-assembled landing pages, which need a block editor rather
            // than a text field — accepting raw JSON here would let a typo
            // corrupt a page with no way to see it in the UI.

            ...SeoRules::rules(),
        ];
    }

    public function messages(): array
    {
        return [
            'slug.alpha_dash' => 'A slug can contain letters, numbers, dashes and underscores only.',
            'slug.unique' => 'Another page already uses that slug.',
        ];
    }
}
