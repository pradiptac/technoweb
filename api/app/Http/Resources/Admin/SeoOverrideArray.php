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
            'og_title' => $seo?->og_title,
            'og_description' => $seo?->og_description,
            'og_image_path' => $seo?->og_image_path,
            'schema_type' => $seo?->schema_type,
            'sitemap_include' => $seo?->sitemap_include ?? true,
        ];
    }
}
