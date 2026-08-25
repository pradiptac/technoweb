<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SliderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'status' => $this->status?->value,
            'autoplay' => (bool) $this->autoplay,
            'interval_ms' => $this->interval_ms,
            'slides' => SlideResource::collection($this->whenLoaded('slides')),
            'slides_count' => $this->whenCounted('slides'),
        ];
    }
}
