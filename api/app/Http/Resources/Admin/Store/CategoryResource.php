<?php

namespace App\Http\Resources\Admin\Store;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CategoryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'description' => $this->description,
            'image_path' => $this->image_path,
            'image_url' => $this->image_path ? asset('storage/'.$this->image_path) : null,
            'is_active' => (bool) $this->is_active,
            'sort_order' => (int) $this->sort_order,
            'product_count' => $this->whenCounted('products'),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
