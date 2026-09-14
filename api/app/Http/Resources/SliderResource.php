<?php

namespace App\Http\Resources;

use App\Models\Slider;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Slider */
class SliderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'status' => $this->status?->value,
            'layout' => $this->layout?->value,
            'transition' => $this->transition?->value,
            'caption_animation' => $this->caption_animation?->value,
            'autoplay' => (bool) $this->autoplay,
            'interval_ms' => $this->interval_ms,
            'slides' => SlideResource::collection($this->whenLoaded('slides')),
            'slides_count' => $this->whenCounted('slides'),
        ];
    }
}
