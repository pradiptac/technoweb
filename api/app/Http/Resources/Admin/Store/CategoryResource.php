<?php

namespace App\Http\Resources\Admin\Store;

use App\Http\Resources\Admin\SeoOverrideArray;
use App\Http\Resources\Concerns\IncludesAnswerContent;
use App\Models\StoreCategory;
use App\Support\Store\SpecFilter;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin StoreCategory */
class CategoryResource extends JsonResource
{
    use IncludesAnswerContent;

    public function toArray(Request $request): array
    {
        // The same test `ProductCategoryResource` uses: the override panel is
        // only worth the two extra queries on the screens that render it.
        $detail = $request->routeIs('*.show', '*.store', '*.update');

        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'description' => $this->description,
            'google_product_category' => $this->google_product_category,
            'icon_path' => $this->icon_path,
            'icon_url' => $this->icon_path ? asset('storage/'.$this->icon_path) : null,
            'image_path' => $this->image_path,
            'image_url' => $this->image_path ? asset('storage/'.$this->image_path) : null,
            'is_active' => (bool) $this->is_active,
            'sort_order' => (int) $this->sort_order,
            'product_count' => $this->whenCounted('products'),
            'filter_specs' => array_values($this->filter_specs ?? []),
            // The labels the filter picker offers: every spec label this
            // category's published products carry, with how many carry it,
            // plus any chosen label nothing carries any more (at 0, so it can
            // be removed). Detail only — it is a query over the index.
            'spec_labels' => $this->when($detail, fn () => SpecFilter::labelsInUse($this->resource)),
            'faqs' => $this->adminFaqs(),
            // Every block, drafts included, for the AEO tab's repeater.
            'answer_blocks' => $this->adminAnswerBlocks(),
            'seo' => $this->when($detail, fn () => SeoOverrideArray::from($this->seo)),
            'seo_defaults' => $this->when($detail, fn () => $this->resolvedSeo()),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
