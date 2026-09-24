<?php

namespace App\Http\Resources;

use App\Http\Resources\Concerns\IncludesAnswerContent;
use App\Http\Resources\Concerns\IncludesSchema;
use App\Http\Resources\Concerns\IncludesSeo;
use App\Models\ProductCategory;
use App\Support\MediaMeta;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin ProductCategory */
class ProductCategoryResource extends JsonResource
{
    use IncludesAnswerContent, IncludesSchema, IncludesSeo;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            // The sitemap's `lastmod`: a record's own last change, never the build time. `docs/seo-audit-2026-09-18.md`, F2.
            'updated_at' => $this->updated_at?->toIso8601String(),
            'description' => $this->description,
            'icon' => $this->icon,
            'image' => $this->image_path ? asset('storage/'.$this->image_path) : null,
            'image_alt' => MediaMeta::alt($this->image_path),
            'image_focus' => MediaMeta::focus($this->image_path),
            'parent_id' => $this->parent_id,
            'children' => self::collection($this->whenLoaded('children')),
            // Both are loaded only where they are wanted, so a category
            // nested inside a product's payload does not drag a count query
            // and a solutions lookup along with it.
            'product_count' => $this->whenCounted('products'),
            'related_solutions' => SolutionResource::collection($this->whenLoaded('relatedSolutions')),
            'faqs' => $this->publicFaqs(),
            // The published blocks, in order, with the heading each renders under.
            'answer_blocks' => $this->publicAnswerBlocks(),
            // What this record is connected to, on the page only (`EntityLinks`).
            'entity' => $this->entity(),
            // An FAQPage over the FAQs and question blocks; absent under two entries.
            'faq_schema' => $this->faqSchema(),
            'seo' => $this->seo(),
        ];
    }
}
