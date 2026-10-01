<?php

namespace App\Http\Resources\Admin;

use App\Models\ServiceCategory;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A service category as the console edits it. No status and no SEO — see
 * `ServiceCategoryRequest`.
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
            'sort_order' => (int) $this->sort_order,
            'image_background' => (bool) $this->image_background,
            'is_active' => (bool) $this->is_active,
            'services_count' => $this->whenCounted('services'),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
