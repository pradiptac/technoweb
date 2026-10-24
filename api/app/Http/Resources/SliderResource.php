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
            'media_effect' => $this->media_effect->value,
            'navigation' => $this->navigation->value,
            'height' => $this->height->value,
            'height_mobile' => $this->height_mobile,
            'height_desktop' => $this->height_desktop,
            'autoplay' => (bool) $this->autoplay,
            'interval_ms' => $this->interval_ms,
            // What the console reads to ask twice before deleting. The API
            // refuses an unconfirmed delete regardless; this is so the screen
            // can say what the page falls back to, in the API's own words.
            'is_reserved' => $this->isReserved(),
            'reserved_for' => $this->reservedFor(),
            'slides' => SlideResource::collection($this->whenLoaded('slides')),
            'slides_count' => $this->whenCounted('slides'),
        ];
    }
}
