<?php

namespace App\Http\Resources\Admin\Store;

use App\Http\Resources\Admin\SeoOverrideArray;
use App\Models\StoreTag;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** A shop tag as the Tags screen draws it. */
/** @mixin StoreTag */
class TagResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        // The override panel's two queries are only worth it on the edit screen.
        $detail = $request->routeIs('*.show', '*.update');

        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'is_visible' => (bool) $this->is_visible,
            'sort_order' => (int) $this->sort_order,
            'heading' => $this->heading,
            'intro' => $this->intro,
            'public_path' => $this->publicPath(),
            'seo' => $this->when($detail, fn () => SeoOverrideArray::from($this->seo)),
            'seo_defaults' => $this->when($detail, fn () => $this->resolvedSeo()),
            // Every product carrying it, drafts included — what deleting it would touch.
            'products_count' => $this->whenCounted('products', fn () => (int) $this->products_count),
        ];
    }
}
