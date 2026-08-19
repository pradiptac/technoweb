<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ServiceResource extends JsonResource
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
            'body' => $this->when($detail, $this->body),
            'faqs' => FaqResource::collection($this->whenLoaded('faqs')),
            'seo' => $this->when($detail || $request->boolean('with_seo'),
                fn () => new SeoResource($this->resolvedSeo())),
        ];
    }
}
