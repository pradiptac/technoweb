<?php

namespace App\Http\Resources\Admin;

use App\Http\Resources\Concerns\IncludesAnswerContent;
use App\Models\ProductCategory;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * No status field — see StoreProductCategoryRequest. Categories are taxonomy.
 */
/** @mixin ProductCategory */
class ProductCategoryResource extends JsonResource
{
    use IncludesAnswerContent;

    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show', '*.store', '*.update');

        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'description' => $this->description,
            'icon' => $this->icon,
            'image_path' => $this->image_path,
            'image' => $this->image_path ? asset('storage/'.$this->image_path) : null,
            'parent_id' => $this->parent_id,
            'parent_name' => $this->whenLoaded('parent', fn () => $this->parent?->name),
            'sort_order' => (int) $this->sort_order,
            'show_in_menu' => (bool) $this->show_in_menu,
            'product_count' => $this->whenCounted('products'),
            'child_count' => $this->whenCounted('children'),
            'faqs' => $this->adminFaqs(),
            // Every block, drafts included, for the AEO tab's repeater.
            'answer_blocks' => $this->adminAnswerBlocks(),
            'seo' => $this->when($detail, fn () => SeoOverrideArray::from($this->seo)),
            'seo_defaults' => $this->when($detail, fn () => $this->resolvedSeo()),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
