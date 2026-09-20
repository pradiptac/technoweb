<?php

namespace App\Http\Resources\Admin;

use App\Models\TeamMember;
use App\Models\TeamMemberCertification;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A team member as the console edits them, certifications and all — every
 * row, lapsed ones included, with the `credential_id` the public resource
 * withholds.
 *
 * @mixin TeamMember
 */
class TeamMemberResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'designation' => $this->designation,
            'department' => $this->department,
            'photo_path' => $this->photo_path,
            'photo' => filled($this->photo_path)
                ? asset('storage/'.$this->photo_path).'?v='.($this->updated_at?->timestamp ?? 0)
                : null,
            'bio' => $this->bio,
            'email' => $this->email,
            'linkedin_url' => $this->linkedin_url,
            'status' => $this->status?->value,
            'sort_order' => (int) $this->sort_order,
            'certifications' => $this->whenLoaded('certifications', fn () => $this->certifications->map(
                fn (TeamMemberCertification $c) => [
                    'id' => $c->id,
                    'name' => $c->name,
                    'issuer' => $c->issuer,
                    'credential_id' => $c->credential_id,
                    'issued_on' => $c->issued_on?->toDateString(),
                    'expires_on' => $c->expires_on?->toDateString(),
                    'is_expired' => $c->isExpired(),
                ],
            )),
            'certification_count' => $this->whenCounted('certifications'),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
