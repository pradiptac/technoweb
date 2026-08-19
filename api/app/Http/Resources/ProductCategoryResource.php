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
            'seo' => $this->when(
                $request->boolean('with_seo'),
                fn () => new SeoResource($this->resolvedSeo())
            ),
        ];
    }
}
