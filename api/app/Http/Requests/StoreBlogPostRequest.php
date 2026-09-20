<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use App\Http\Requests\Concerns\SanitisesRichText;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreBlogPostRequest extends FormRequest
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

            ...SeoRules::rules(),
        ];
    }

    public function messages(): array
    {
        return [
            'title.required' => 'Give the post a title.',
            'slug.alpha_dash' => 'A slug can contain letters, numbers, dashes and underscores only.',
            'slug.unique' => 'Another post already uses that slug.',
            'excerpt.max' => 'The excerpt is limited to 500 characters.',
            'seo.description.max' => 'A meta description over 320 characters will be truncated by search engines.',
        ];
    }
}
