<?php

namespace App\Http\Resources\Store;

use App\Http\Resources\Concerns\IncludesAnswerContent;
use App\Http\Resources\Concerns\IncludesSchema;
use App\Http\Resources\SeoResource;
use App\Models\StoreCategory;
use App\Support\MediaMeta;
use App\Support\MediaUrl;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin StoreCategory */
class CategoryResource extends JsonResource
{
    use IncludesAnswerContent, IncludesSchema;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            // The sitemap's `lastmod`: a record's own last change, never the build time. `docs/seo-audit-2026-09-18.md`, F2.
            'updated_at' => $this->updated_at?->toIso8601String(),
            'description' => $this->description,
            // The mark the rail renders; the photograph below it is what a
            // share preview uses. Two different jobs, two fields.
            'icon_url' => $this->icon_path ? MediaUrl::for($this->icon_path) : null,
            'image_url' => $this->image_path ? MediaUrl::for($this->image_path) : null,
            // The photograph's focal point from the library, or null: the
            // rail crops it to a disc and the share preview to 1200x630.
            'image_focus' => MediaMeta::focus($this->image_path),
            'image_blur' => MediaMeta::blur($this->image_path),
            // Present only when the controller counted them: a listing needs
            // the figure and a detail page does not, and `withCount` on a
            // resource that might not have it is a lazy load waiting to throw.
            'product_count' => $this->whenCounted('products'),
            // The specification filters offered on this category, in order
            // (2026-09-26); the values and counts are `/facets`, fetched only
            // where a panel is drawn. Empty when none are chosen.
            'filter_specs' => array_values($this->filter_specs ?? []),
            // relationLoaded, not whenLoaded: the latter short-circuits to null
            // when the relation is loaded but empty, and most records have no
            // override row -- the derived defaults are still wanted for those.
            // The index never loads it, so a listing carries no `seo` key at
            // all rather than one derived on every row for nothing read there.
            'faqs' => $this->publicFaqs(),
            // The published blocks, in order, with the heading each renders under.
            'answer_blocks' => $this->publicAnswerBlocks(),
            // What this record is connected to, on the page only (`EntityLinks`).
            'entity' => $this->entity(),
            // An FAQPage over the FAQs and question blocks; absent under two entries.
            'faq_schema' => $this->faqSchema(),
            'seo' => $this->when(
                $this->resource->relationLoaded('seo'),
                fn () => new SeoResource($this->resolvedSeo()),
            ),
        ];
    }
}
