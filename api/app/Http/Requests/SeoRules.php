<?php

namespace App\Http\Requests;

/**
 * Validation for the nested SEO override block, shared by every CMS entity's
 * store and update request. Column limits mirror the seo_metadata table.
 */
class SeoRules
{
    public static function rules(): array
    {
        return [
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
}
