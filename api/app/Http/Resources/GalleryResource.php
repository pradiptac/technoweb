<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class GalleryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'subtitle' => $this->subtitle,
            'status' => $this->status?->value,
            'transition' => $this->transition?->value,
            'autoplay' => (bool) $this->autoplay,
            'interval_ms' => $this->interval_ms,
            'groups' => GalleryGroupResource::collection($this->whenLoaded('groups')),
            'items' => GalleryItemResource::collection($this->whenLoaded('items')),
            'items_count' => $this->whenCounted('items'),
        ];
    }
}
