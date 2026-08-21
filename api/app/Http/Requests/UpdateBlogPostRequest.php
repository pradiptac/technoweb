<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use App\Http\Requests\Concerns\SanitisesRichText;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateBlogPostRequest extends FormRequest
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
            // ignore() on the bound post, or saving a post without touching
            // its slug would collide with itself.
            'slug' => ['sometimes', 'required', 'string', 'max:255', 'alpha_dash',
                Rule::unique('blog_posts', 'slug')->ignore($this->route('blog_post'))],
            'excerpt' => ['sometimes', 'nullable', 'string', 'max:500'],
            'body' => ['sometimes', 'nullable', 'string'],
            'status' => ['sometimes', Rule::enum(PublishStatus::class)],
            'published_at' => ['sometimes', 'nullable', 'date'],
            'author_id' => ['sometimes', 'nullable', 'integer', Rule::exists('users', 'id')->where('is_active', true)],
            'cover_image_path' => ['sometimes', 'nullable', 'string', 'max:255'],

            'seo' => ['sometimes', 'array'],
            'seo.title' => ['nullable', 'string', 'max:255'],
            'seo.description' => ['nullable', 'string', 'max:320'],
            'seo.canonical_url' => ['nullable', 'url', 'max:255'],
            'seo.robots' => ['nullable', 'string', 'max:60'],
            'seo.focus_keyword' => ['nullable', 'string', 'max:255'],
            'seo.og_title' => ['nullable', 'string', 'max:255'],
            'seo.og_description' => ['nullable', 'string', 'max:320'],
            'seo.og_image_path' => ['nullable', 'string', 'max:255'],
            'seo.schema_type' => ['nullable', 'string', 'max:40'],
            'seo.sitemap_include' => ['nullable', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'slug.alpha_dash' => 'A slug can contain letters, numbers, dashes and underscores only.',
            'slug.unique' => 'Another post already uses that slug.',
            'excerpt.max' => 'The excerpt is limited to 500 characters.',
            'seo.description.max' => 'A meta description over 320 characters will be truncated by search engines.',
        ];
    }
}
