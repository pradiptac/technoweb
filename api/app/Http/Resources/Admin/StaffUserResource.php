<?php

namespace App\Http\Resources\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Distinct from the public UserResource used by the assignment picker, which
 * returns only id and name. This one carries what the staff screen edits.
 *
 * The password is never present in any form — not hashed, not masked. A
 * generated one is returned exactly once, by the create endpoint, and is not
 * part of this resource.
 */
class StaffUserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'is_active' => (bool) $this->is_active,
            'roles' => $this->whenLoaded('roles', fn () => $this->roles->map(fn ($r) => [
                'slug' => $r->slug,
                'label' => $r->name,
            ])),
            'role_slugs' => $this->whenLoaded('roles', fn () => $this->roles->pluck('slug')),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
