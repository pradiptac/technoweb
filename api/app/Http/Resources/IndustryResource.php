<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class IndustryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show');

        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'summary' => $this->summary,
            'icon' => $this->icon,
            'body' => $this->when($detail, $this->body),
            'solutions' => SolutionResource::collection($this->whenLoaded('solutions')),
            'seo' => $this->when($detail, fn () => new SeoResource($this->resolvedSeo())),
        ];
    }
}
