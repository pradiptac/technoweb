<?php

namespace App\Http\Resources;

use App\Http\Resources\Concerns\IncludesAnswerContent;
use App\Http\Resources\Concerns\IncludesCustomFields;
use App\Http\Resources\Concerns\IncludesSchema;
use App\Http\Resources\Concerns\IncludesSections;
use App\Http\Resources\Concerns\IncludesSeo;
use App\Models\Product;
use App\Support\MediaMeta;
use App\Support\MediaUrl;
use App\Support\StructuredData;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Product */
class ProductResource extends JsonResource
{
    use IncludesAnswerContent, IncludesCustomFields, IncludesSchema, IncludesSections, IncludesSeo;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            // The sitemap's `lastmod`: a record's own last change, never the build time. `docs/seo-audit-2026-09-18.md`, F2.
            'updated_at' => $this->updated_at?->toIso8601String(),
            'sku' => $this->sku,
            'is_featured' => (bool) $this->is_featured,
            'short_description' => $this->short_description,
            // Full body only on the detail endpoint — keeps list payloads small.
            'description' => $this->when($request->routeIs('*.show'), $this->description),
            // The builder's sections in place of the written body (0.130.0): on
            // this record's own page only, and only while it is laid out as
            // sections. The body above is still sent.
            'sections' => $this->publicSections($this->includeSchema),
            // The kind's active detail template (0.161.0): on this record's own page only; absent when none is active.
            'detail_template' => $this->publicDetailTemplate('product', $this->includeSchema),
            'specifications' => $this->when($request->routeIs('*.show'), $this->specifications),
            'features' => $this->when($request->routeIs('*.show'), $this->features),
            'images' => collect($this->images ?? [])->map(fn ($p) => MediaUrl::for($p))->all(),
            // Parallel to `images`, index for index — a gallery needs the
            // description that belongs to the picture it is showing.
            'image_alts' => MediaMeta::alts($this->images),
            // Parallel to `image_alts`, same order and length: the focal point of each, or null.
            'image_focuses' => MediaMeta::focuses($this->images),
            'image_blurs' => MediaMeta::blurs($this->images),
            'datasheet_url' => $this->datasheet_path ? MediaUrl::for($this->datasheet_path) : null,
            'status' => $this->status?->value,
            'brand' => new BrandResource($this->whenLoaded('brand')),
            'category' => new ProductCategoryResource($this->whenLoaded('category')),
            'related_products' => self::collection($this->whenLoaded('relatedProducts')),
            'related_solutions' => SolutionResource::collection($this->whenLoaded('solutions')),
            'faqs' => FaqResource::collection($this->whenLoaded('faqs')),
            // The downloads centre's files for this product — loaded by the
            // detail read alone, so a listing row carries no key.
            'downloads' => $this->whenLoaded('publishedDownloads', fn () => DownloadResource::forRecord($this->publishedDownloads)),
            // The published blocks, in order, with the heading each renders under.
            'answer_blocks' => $this->publicAnswerBlocks(),
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
            'schema' => $this->schema(fn () => StructuredData::product($this->resource)),
        ];
    }
}
