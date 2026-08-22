<?php

namespace App\Http\Resources\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RedirectResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'from_path' => $this->from_path,
            'to_path' => $this->to_path,
            'status_code' => (int) $this->status_code,
            'is_active' => (bool) $this->is_active,
            // Written when a slug changed rather than by a person. Surfaced so
            // the list can separate the two — an editor should think twice
            // before deleting one the CMS put there.
            'created_automatically' => (bool) $this->created_automatically,
            // Telemetry the middleware writes; read-only here. A redirect with
            // no hits in months is a candidate for removal.
            'hit_count' => (int) $this->hit_count,
            'last_hit_at' => $this->last_hit_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
