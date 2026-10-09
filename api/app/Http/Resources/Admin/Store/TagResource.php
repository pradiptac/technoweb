<?php

namespace App\Http\Resources\Admin\Store;

use App\Models\StoreTag;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** A shop tag as the Tags screen draws it. */
/** @mixin StoreTag */
class TagResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'is_visible' => (bool) $this->is_visible,
            'sort_order' => (int) $this->sort_order,
            // Every product carrying it, drafts included — what deleting it would touch.
            'products_count' => $this->whenCounted('products', fn () => (int) $this->products_count),
        ];
    }
}
