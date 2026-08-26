<?php

namespace App\Http\Resources\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One activity row as the console reads it.
 *
 * `actor_name` and `actor_email` come from the stored copies, never from the
 * joined account — the account may be gone, and that is precisely when this
 * screen is being read.
 */
class ActivityResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'action' => $this->action,
            'actor' => [
                'id' => $this->user_id,
                'name' => $this->actor_name,
                'email' => $this->actor_email,
                // Whether the account still exists. The screen says "(removed)"
                // rather than linking to a 404.
                'exists' => $this->user_id !== null,
            ],
            'subject' => $this->subject_type ? [
                'type' => $this->subject_type,
                'id' => $this->subject_id,
                'label' => $this->subject_label,
            ] : null,
            'context' => $this->context,
            'ip' => $this->ip,
            'created_at' => $this->created_at->toIso8601String(),
        ];
    }
}
