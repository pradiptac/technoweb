<?php

namespace App\Http\Resources;

use App\Models\SupportCentre;
use App\Support\Countries;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A support centre as the website shows it. The staff are the ones marked
 * to show, by name and title only — a staff member's email and mobile never
 * leave the console (docs/support-network.md).
 *
 * @mixin SupportCentre
 */
class SupportCentreResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
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
            'staff' => $this->whenLoaded('staff', fn () => $this->staff
                ->filter(fn ($u) => $u->getRelation('pivot')->is_public && $u->is_active)
                ->map(fn ($u) => ['name' => $u->name, 'title' => $u->getRelation('pivot')->title])
                ->values()),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
