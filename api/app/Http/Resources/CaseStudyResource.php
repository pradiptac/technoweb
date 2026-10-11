<?php

namespace App\Http\Resources;

use App\Http\Resources\Concerns\IncludesCustomFields;
use App\Http\Resources\Concerns\IncludesSchema;
use App\Http\Resources\Concerns\IncludesSections;
use App\Http\Resources\Concerns\IncludesSeo;
use App\Models\CaseStudy;
use App\Support\MediaMeta;
use App\Support\MediaUrl;
use App\Support\StructuredData;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin CaseStudy */
class CaseStudyResource extends JsonResource
{
    use IncludesCustomFields, IncludesSchema, IncludesSections, IncludesSeo;

    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show');

        return [
            'id' => $this->id,
            'title' => $this->title,
            'slug' => $this->slug,
            // The sitemap's `lastmod`: a record's own last change, never the build time. `docs/seo-audit-2026-09-18.md`, F2.
            'updated_at' => $this->updated_at?->toIso8601String(),
            'client_name' => $this->client_name,
            'summary' => $this->summary,
            'body' => $this->when($detail, $this->body),
            // The builder's sections in place of the written body (0.129.0): on
            // this record's own page only, and only while it is laid out as
            // sections. The body above is still sent.
            'sections' => $this->publicSections($this->includeSchema),
            // The kind's active detail template (0.161.0): on this record's own page only; absent when none is active.
            'detail_template' => $this->publicDetailTemplate('case_study', $this->includeSchema),
            'results' => $this->results,
            'cover_image' => $this->cover_image_path ? MediaUrl::for($this->cover_image_path) : null,
            'cover_image_alt' => MediaMeta::alt($this->cover_image_path),
            'cover_image_focus' => MediaMeta::focus($this->cover_image_path),
            'cover_image_blur' => MediaMeta::blur($this->cover_image_path),
            'industry' => new IndustryResource($this->whenLoaded('industry')),
            // What this record is connected to, on the page only (`EntityLinks`).
            'entity' => $this->entity(),
            // An FAQPage over the FAQs and question blocks; absent under two entries.
            'faq_schema' => $this->faqSchema(),
            // Custom fields (docs/custom-content.md) — see IncludesCustomFields.
            ...$this->publicCustomFields(),
            'seo' => $this->seo(),
            /*
             * The page's JSON-LD, built server-side.
             *
             * Gated on `withSchema()` rather than on the route, because a nested
             * resource inherits its parent's route name — twenty products inside
             * /solutions/{slug} would each build a Product graph and lazy-load a
             * brand and a category. See the IncludesSchema trait.
             *
             * The frontend renders it through `JsonLd`, which escapes `<`. That
             * boundary stays there: JSON.stringify does not escape it, and a CMS
             * field containing `</script>` would close the block.
             */
            'schema' => $this->schema(fn () => StructuredData::article($this->resource)),
        ];
    }
}
