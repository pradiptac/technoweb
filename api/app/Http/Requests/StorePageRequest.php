<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use App\Http\Requests\Concerns\SanitisesRichText;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StorePageRequest extends FormRequest
{
    use SanitisesRichText;

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255', 'alpha_dash', Rule::unique('pages', 'slug')],
            'body' => ['nullable', 'string'],
            // An allowlist rather than a free string: the frontend can only
            // render the templates it has, and a value it does not know
            // would fall back silently — a page laid out the wrong way with
            // nothing anywhere saying why.
            'template' => ['nullable', 'in:default,wide'],
            'status' => ['required', Rule::enum(PublishStatus::class)],
            'published_at' => ['nullable', 'date'],

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
            'title.required' => 'Give the page a title.',
            'slug.alpha_dash' => 'A slug can contain letters, numbers, dashes and underscores only.',
            'slug.unique' => 'Another page already uses that slug.',
        ];
    }
}
