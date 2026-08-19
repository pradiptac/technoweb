<?php

namespace App\Models\Concerns;

use App\Models\SeoMetadata;
use Illuminate\Database\Eloquent\Relations\MorphOne;

trait HasSeo
{
    public function seo(): MorphOne
    {
        return $this->morphOne(SeoMetadata::class, 'seoable');
    }

    /**
     * Resolved SEO: the automatic value for every field, with any admin
     * override applied on top. Callers should never read `seo` directly.
     */
    public function resolvedSeo(): array
    {
        $override = $this->seo;

        $defaults = $this->defaultSeo();

        return [
            'title' => $override?->title ?: $defaults['title'],
            'description' => $override?->description ?: $defaults['description'],
            'canonical_url' => $override?->canonical_url ?: $defaults['canonical_url'],
            'robots' => $override?->robots ?: 'index, follow',
            'focus_keyword' => $override?->focus_keyword,
            'og_title' => $override?->og_title ?: ($override?->title ?: $defaults['title']),
            'og_description' => $override?->og_description ?: ($override?->description ?: $defaults['description']),
            'og_image' => $override?->og_image_path ? asset('storage/'.$override->og_image_path) : $defaults['og_image'],
            'schema_type' => $override?->schema_type ?: $defaults['schema_type'],
            'sitemap_include' => $override?->sitemap_include ?? true,
        ];
    }

    /**
     * Each model describes how to build its own metadata when nothing has been
     * entered by hand. Override in the model.
     */
    abstract public function defaultSeo(): array;
}
