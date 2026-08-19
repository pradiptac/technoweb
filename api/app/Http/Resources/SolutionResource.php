<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SolutionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show');

        return [
            'id' => $this->id,
            'title' => $this->title,
            'slug' => $this->slug,
            'summary' => $this->summary,
            'icon' => $this->icon,
            'hero_image' => $this->hero_image_path ? asset('storage/'.$this->hero_image_path) : null,
            'problem_statement' => $this->when($detail, $this->problem_statement),
            'overview' => $this->when($detail, $this->overview),
            'benefits' => $this->when($detail, $this->benefits),
            'technologies' => $this->when($detail, $this->technologies),
            'status' => $this->status?->value,
            'products' => ProductResource::collection($this->whenLoaded('products')),
            'industries' => IndustryResource::collection($this->whenLoaded('industries')),
            'faqs' => FaqResource::collection($this->whenLoaded('faqs')),
            'seo' => $this->when($detail || $request->boolean('with_seo'),
                fn () => new SeoResource($this->resolvedSeo())),
        ];
    }
}
