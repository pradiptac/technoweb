<?php

namespace App\Http\Resources;

use App\Support\MediaAlt;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SlideResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind,
            'url' => $this->media_path ? asset('storage/'.$this->media_path) : null,
            'poster_url' => $this->poster_path ? asset('storage/'.$this->poster_path) : null,
            // The id, never a URL. The frontend builds the embed src from it,
            // so there is no arbitrary string on the path to an iframe.
            'youtube_id' => $this->youtube_id,
            // The slide's own alt wins; the media library's description is the
            // fallback, so a slide built from an already-described file needs
            // nothing typed twice.
            'alt' => $this->alt_text ?: MediaAlt::for($this->media_path),
            'heading' => $this->heading,
            'caption' => $this->caption,
            'link_url' => $this->link_url,
            'link_label' => $this->link_label,
        ];
    }
}
