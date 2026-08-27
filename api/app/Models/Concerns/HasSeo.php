<?php

namespace App\Models\Concerns;

use App\Models\SeoMetadata;
use App\Support\SchemaTypes;
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
            /*
             * Through the allowlist rather than straight from the override.
             *
             * `SchemaTypes` decides what this record is allowed to call
             * itself, and a stored value outlives the rule that accepted it —
             * so the resolution happens on read as well as on write. See that
             * class for why the list is eight bases and not schema.org's.
             */
            'schema_type' => SchemaTypes::resolve($defaults['schema_type'] ?? null, $override?->schema_type),
            /*
             * What the console's dropdown is built from.
             *
             * Sent rather than duplicated in TypeScript: the frontend needs
             * the list to render the options and the backend needs it to
             * validate, and two hand-written copies of a list of strings is
             * exactly the drift nothing type-checks across the wire.
             */
            'schema_type_options' => SchemaTypes::for($defaults['schema_type'] ?? null),
            'sitemap_include' => $override?->sitemap_include ?? true,
        ];
    }

    /**
     * Each model describes how to build its own metadata when nothing has been
     * entered by hand. Override in the model.
     */
    abstract public function defaultSeo(): array;
}
