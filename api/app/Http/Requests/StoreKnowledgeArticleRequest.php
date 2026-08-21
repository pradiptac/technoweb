<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use App\Http\Requests\Concerns\SanitisesRichText;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreKnowledgeArticleRequest extends FormRequest
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
            'slug' => ['nullable', 'string', 'max:255', 'alpha_dash', Rule::unique('knowledge_articles', 'slug')],
            'excerpt' => ['nullable', 'string', 'max:500'],
            'body' => ['nullable', 'string'],
            'status' => ['required', Rule::enum(PublishStatus::class)],
            'published_at' => ['nullable', 'date'],
            'knowledge_category_id' => ['nullable', 'integer', Rule::exists('knowledge_categories', 'id')],

            // Tags are searched by KnowledgeArticle::scopeSearch, so they are
            // a findability feature, not decoration.
            'tags' => ['sometimes', 'array', 'max:20'],
            'tags.*' => ['string', 'max:40'],

            // view_count and helpful_count are deliberately absent — they are
            // telemetry the site writes, not fields an editor sets.

            ...SeoRules::rules(),
        ];
    }

    public function messages(): array
    {
        return [
            'title.required' => 'Give the article a title.',
            'slug.alpha_dash' => 'A slug can contain letters, numbers, dashes and underscores only.',
            'slug.unique' => 'Another article already uses that slug.',
            'excerpt.max' => 'The excerpt is limited to 500 characters.',
            'tags.max' => 'Twenty tags is plenty — more makes search worse, not better.',
        ];
    }
}
