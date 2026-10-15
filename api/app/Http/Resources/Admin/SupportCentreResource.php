<?php

namespace App\Http\Resources\Admin;

use App\Models\SupportCentre;
use App\Support\Countries;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin SupportCentre */
class SupportCentreResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'kind' => $this->kind->value,
            'kind_label' => $this->kind->label(),
            'country_code' => $this->country_code,
            'country' => Countries::name($this->country_code) ?? $this->country_code,
            'region' => $this->region,
            'city' => $this->city,
            'address' => $this->address,
            'phone' => $this->phone,
            'phone_alt' => $this->phone_alt,
            'email' => $this->email,
            'hours' => $this->hours,
            'latitude' => $this->latitude,
            'longitude' => $this->longitude,
            'location_id' => $this->location_id,
            'sort_order' => $this->sort_order,
            'is_active' => (bool) $this->is_active,
            'staff_count' => $this->whenCounted('staff'),
            // `pivot` is set by `withPivot()` on the relation, which the analyser cannot see.
            'staff' => $this->whenLoaded('staff', fn () => $this->staff->map(fn ($u) => [
                'user_id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'is_active' => (bool) $u->is_active,
                'title' => $u->getRelation('pivot')->title,
                'is_public' => (bool) $u->getRelation('pivot')->is_public,
            ])->values()),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
