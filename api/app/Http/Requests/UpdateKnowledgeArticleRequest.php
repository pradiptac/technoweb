<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use App\Http\Requests\Concerns\SanitisesRichText;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateKnowledgeArticleRequest extends FormRequest
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
                Rule::unique('knowledge_articles', 'slug')->ignore($this->route('knowledge_article'))],
            'excerpt' => ['sometimes', 'nullable', 'string', 'max:500'],
            'body' => ['sometimes', 'nullable', 'string'],
            'status' => ['sometimes', Rule::enum(PublishStatus::class)],
            'published_at' => ['sometimes', 'nullable', 'date'],
            'knowledge_category_id' => ['sometimes', 'nullable', 'integer', Rule::exists('knowledge_categories', 'id')],

            'tags' => ['sometimes', 'array', 'max:20'],
            'tags.*' => ['string', 'max:40'],

            ...SeoRules::rules(),
        ];
    }

    public function messages(): array
    {
        return [
            'slug.alpha_dash' => 'A slug can contain letters, numbers, dashes and underscores only.',
            'slug.unique' => 'Another article already uses that slug.',
            'excerpt.max' => 'The excerpt is limited to 500 characters.',
            'tags.max' => 'Twenty tags is plenty — more makes search worse, not better.',
        ];
    }
}
