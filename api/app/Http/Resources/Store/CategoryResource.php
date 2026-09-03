<?php

namespace App\Http\Resources\Store;

use App\Http\Resources\SeoResource;
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
            // relationLoaded, not whenLoaded: the latter short-circuits to null
            // when the relation is loaded but empty, and most records have no
            // override row -- the derived defaults are still wanted for those.
            // The index never loads it, so a listing carries no `seo` key at
            // all rather than one derived on every row for nothing read there.
            'seo' => $this->when(
                $this->resource->relationLoaded('seo'),
                fn () => new SeoResource($this->resolvedSeo()),
            ),
        ];
    }
}
