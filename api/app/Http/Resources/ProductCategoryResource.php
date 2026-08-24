<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductCategoryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'description' => $this->description,
            'icon' => $this->icon,
            'parent_id' => $this->parent_id,
            'children' => self::collection($this->whenLoaded('children')),
            // Both are loaded only where they are wanted, so a category
            // nested inside a product's payload does not drag a count query
            // and a solutions lookup along with it.
            'product_count' => $this->whenCounted('products'),
            'related_solutions' => SolutionResource::collection($this->whenLoaded('relatedSolutions')),
            // Present only when eager-loaded, matching ProductResource. This
            // used to gate on a ?with_seo query flag that nothing ever sent,
            // so the controller's eager-load was wasted and an editor's SEO
            // override on a category was silently dropped.
            'seo' => $this->when(
                $this->resource->relationLoaded('seo'),
                fn () => new SeoResource($this->resolvedSeo())
            ),
        ];
    }
}
