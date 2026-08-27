<?php

namespace App\Http\Requests;

use App\Support\SchemaTypes;
use Illuminate\Validation\Rule;

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
            /*
             * An allowlist, not a length.
             *
             * `max:40` accepted `Recipe` on a network switch, which was
             * harmless only because nothing read the column. Now that
             * `StructuredData` emits it, a type the graph cannot support is a
             * claim about the page that the page does not back up.
             *
             * The union rather than this record's own list, because this
             * method is static and has no record. `SchemaTypes::resolve()`
             * narrows per record on the way out, so the pairing still cannot
             * reach the graph.
             *
             * `robots` deliberately keeps its length rule rather than joining
             * the four the console offers: the directive vocabulary is open —
             * `noarchive`, `max-snippet:-1` — and a dropdown constraining what
             * an editor can produce is not a reason to refuse what an
             * integration might legitimately send.
             */
            'seo.schema_type' => ['nullable', 'string', Rule::in(SchemaTypes::all())],
            'seo.sitemap_include' => ['nullable', 'boolean'],
        ];
    }
}
