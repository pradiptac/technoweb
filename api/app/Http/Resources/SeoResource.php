<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Wraps the *resolved* SEO array (automatic values + admin overrides), never
 * the raw seo_metadata row — the frontend should not have to know which
 * fields were entered by hand.
 */
class SeoResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'title' => $this['title'] ?? null,
            'description' => $this['description'] ?? null,
            'canonical_url' => $this['canonical_url'] ?? null,
            'robots' => $this['robots'] ?? null,
            'focus_keyword' => $this['focus_keyword'] ?? null,
            'og_title' => $this['og_title'] ?? null,
            'og_description' => $this['og_description'] ?? null,
            'og_image' => $this['og_image'] ?? null,
            'schema_type' => $this['schema_type'] ?? null,
            'sitemap_include' => (bool) ($this['sitemap_include'] ?? true),
        ];
    }
}
