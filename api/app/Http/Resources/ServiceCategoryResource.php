<?php

namespace App\Http\Resources;

use App\Models\ServiceCategory;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A service category as the public site groups the services by it: one tab
 * each, in this order. Nothing about the console — no count, no `is_active`
 * (an inactive one is never listed).
 */
/** @mixin ServiceCategory */
class ServiceCategoryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'description' => $this->description,
            'icon' => $this->icon,
            'image_background' => (bool) $this->image_background,
        ];
    }
}
