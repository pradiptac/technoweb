<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CaseStudyResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show');

        return [
            'id' => $this->id,
            'title' => $this->title,
            'slug' => $this->slug,
            'client_name' => $this->client_name,
            'summary' => $this->summary,
            'body' => $this->when($detail, $this->body),
            'results' => $this->results,
            'cover_image' => $this->cover_image_path ? asset('storage/'.$this->cover_image_path) : null,
            'industry' => new IndustryResource($this->whenLoaded('industry')),
            'seo' => $this->when($detail, fn () => new SeoResource($this->resolvedSeo())),
        ];
    }
}
