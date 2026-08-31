<?php

namespace App\Http\Resources\Store;

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
            'image_url' => $this->image_path ? asset('storage/'.$this->image_path) : null,
            // Present only when the controller counted them: a listing needs
            // the figure and a detail page does not, and `withCount` on a
            // resource that might not have it is a lazy load waiting to throw.
            'product_count' => $this->whenCounted('products'),
        ];
    }
}
