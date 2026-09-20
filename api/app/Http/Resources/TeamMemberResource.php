<?php

namespace App\Http\Resources;

use App\Models\TeamMember;
use App\Support\MediaAlt;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A team member as the public site introduces them.
 *
 * `photo_path` never appears. `email` and `linkedin_url` do, when filled —
 * the form says they will. The certifications ride along already filtered
 * to the current ones by the controller's eager load; a lapsed CCNA is not
 * something to print beside somebody's name.
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
            'bio' => $this->bio,
            'photo' => filled($this->photo_path) ? asset('storage/'.$this->photo_path) : null,
            'photo_alt' => MediaAlt::for($this->photo_path) ?: $this->name,
            'email' => $this->email,
            'linkedin_url' => $this->linkedin_url,
            'certifications' => TeamMemberCertificationResource::collection($this->whenLoaded('certifications')),
        ];
    }
}
