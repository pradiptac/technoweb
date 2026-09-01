<?php

namespace App\Http\Resources;

use App\Support\MediaAlt;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class GalleryItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'url' => $this->media_path ? asset('storage/'.$this->media_path) : null,
            // The item's own alt wins; the media library's description is the
            // fallback, so a picture already described in the library needs
            // nothing typed twice.
            'alt' => $this->alt_text ?: MediaAlt::for($this->media_path),
            'title' => $this->title,
            'subtitle' => $this->subtitle,
            'link_url' => $this->link_url,
            // The tab, by slug. The frontend filters on it, and a slug is
            // stable across a save where the id is not — groups are replaced
            // wholesale, so ids are renumbered on every write.
            'group' => $this->whenLoaded('group', fn () => $this->group?->slug),
        ];
    }
}
