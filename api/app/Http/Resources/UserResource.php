<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            // So the profile screen can say whether a number is on file; the
            // number itself is edited on the Staff screen by an administrator.
            'phone' => $this->phone,
            'roles' => $this->whenLoaded('roles', fn () => $this->roles->map(fn ($role) => [
                'slug' => $role->slug,
                'label' => $role->name,
            ])),
            'is_active' => $this->is_active,
        ];
    }
}
