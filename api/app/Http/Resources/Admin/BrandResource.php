<?php

namespace App\Http\Resources\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Separate from the public BrandResource, which returns only what a filter
 * chip needs. This one carries the editable columns and the product count,
 * so the list can show what a delete would orphan.
 */
class BrandResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'description' => $this->description,
            'logo_path' => $this->logo_path,
            'logo' => $this->logo_path ? asset('storage/'.$this->logo_path) : null,
            'sort_order' => (int) $this->sort_order,
            'is_featured' => (bool) $this->is_featured,
            'product_count' => $this->whenCounted('products'),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
