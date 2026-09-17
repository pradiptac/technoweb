<?php

namespace App\Http\Resources;

use App\Http\Resources\Concerns\IncludesSeo;
use App\Models\ProductCategory;
use App\Support\MediaAlt;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin ProductCategory */
class ProductCategoryResource extends JsonResource
{
    use IncludesSeo;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'description' => $this->description,
            'icon' => $this->icon,
            'image' => $this->image_path ? asset('storage/'.$this->image_path) : null,
            'image_alt' => MediaAlt::for($this->image_path),
            'parent_id' => $this->parent_id,
            'children' => self::collection($this->whenLoaded('children')),
            // Both are loaded only where they are wanted, so a category
            // nested inside a product's payload does not drag a count query
            // and a solutions lookup along with it.
            'product_count' => $this->whenCounted('products'),
            'related_solutions' => SolutionResource::collection($this->whenLoaded('relatedSolutions')),
            'seo' => $this->seo(),
        ];
    }
}
