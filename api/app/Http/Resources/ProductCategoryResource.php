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
