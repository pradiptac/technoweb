<?php

namespace App\Http\Resources\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MenuResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'location' => $this->location?->value,
            'location_label' => $this->location?->label(),
            'item_count' => $this->whenCounted('items'),
            'items' => MenuItemResource::collection($this->whenLoaded('roots')),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
