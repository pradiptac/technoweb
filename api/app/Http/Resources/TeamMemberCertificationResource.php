<?php

namespace App\Http\Resources;

use App\Models\TeamMemberCertification;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One of a team member's certifications, publicly.
 *
 * **No `credential_id`.** With a surname it is what an issuer's verification
 * page asks for, and a page that hands both out is doing a stranger's
 * homework. The console sees it; the site does not, until somebody asks.
 *
 * @mixin TeamMemberCertification
 */
class TeamMemberCertificationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'name' => $this->name,
            'issuer' => $this->issuer,
            'issued_on' => $this->issued_on?->toDateString(),
            'expires_on' => $this->expires_on?->toDateString(),
        ];
    }
}
