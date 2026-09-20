<?php

namespace App\Http\Resources\Admin;

use App\Models\SeoMetadata;

/**
 * The raw SEO override row, as the CMS edit form needs it.
 *
 * Distinct from SeoResource, which wraps HasSeo::resolvedSeo() — that merges
 * overrides over derived defaults and so cannot tell "the editor typed this"
 * from "we generated this". The form needs the un-merged truth, including the
 * nulls, or every field would come back pre-filled with a derived value and
 * saving would silently promote all of them to real overrides.
 *
 * Returns an all-null shape when nothing was ever set, so the form does not
 * have to special-case a missing row.
 */
class SeoOverrideArray
{
    public static function from(?SeoMetadata $seo): array
    {
        return [
            'title' => $seo?->title,
            'description' => $seo?->description,
            'canonical_url' => $seo?->canonical_url,
            'robots' => $seo?->robots,
            'focus_keyword' => $seo?->focus_keyword,
            // `[]`, never null — the form maps over it, and a null here would
            // make every record nobody has been through yet throw.
            'secondary_keywords' => $seo?->secondary_keywords ?? [],
            'og_title' => $seo?->og_title,
            'og_description' => $seo?->og_description,
            'og_image_path' => $seo?->og_image_path,
            /*
             * The resolved URL beside the stored path, the pattern every other
             * `_path` in this product follows.
             *
             * Without it the picker has a path and no way to draw a preview,
             * which is half of why this field was never added to the shared SEO
             * panel in the first place — while `share_image` went on marking
             * records down for not having one.
             */
            'og_image' => $seo?->og_image_path ? asset('storage/'.$seo->og_image_path) : null,
            'schema_type' => $seo?->schema_type,
            'sitemap_include' => $seo?->sitemap_include ?? true,
        ];
    }
}
