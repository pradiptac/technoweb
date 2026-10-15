<?php

namespace App\Http\Resources\Admin;

use App\Models\PreviewLink;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A draft share link as staff see it.
 *
 * The token appears once, inside `path`, and nowhere else. `path` is a path
 * and never a URL: `FRONTEND_URL` is the production domain on every machine,
 * so a link built on it would send a developer's reviewer to the live site.
 * The console puts the browser's own origin in front.
 *
 * @mixin PreviewLink
 */
class PreviewLinkResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->subject_type,
            'subject_id' => (int) $this->subject_id,
            'path' => '/preview/'.$this->token,
            'expires_at' => $this->expires_at->toIso8601String(),
            'expires_label' => $this->expires_at->format('j F Y'),
            'is_expired' => $this->isExpired(),
            'views' => (int) $this->views,
            'last_viewed_at' => $this->last_viewed_at?->toIso8601String(),
            'created_by' => $this->whenLoaded('creator', fn () => $this->creator?->name),
        ];
    }
}
