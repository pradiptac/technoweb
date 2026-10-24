<?php

namespace App\Http\Resources;

use App\Models\Slide;
use App\Support\MediaMeta;
use App\Support\MediaUrl;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Slide */
class SlideResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind,
            'url' => $this->media_path ? MediaUrl::for($this->media_path) : null,
            'poster_url' => $this->poster_path ? MediaUrl::for($this->poster_path) : null,
            // The id, never a URL. The frontend builds the embed src from it,
            // so there is no arbitrary string on the path to an iframe.
            'youtube_id' => $this->youtube_id,
            // The slide's own alt wins; the media library's description is the
            // fallback, so a slide built from an already-described file needs
            // nothing typed twice.
            'alt' => $this->alt_text ?: MediaMeta::alt($this->media_path),
            // The file's focal point; a slide is the most cropped picture on the site.
            'focus' => MediaMeta::focus($this->media_path),
            'blur' => MediaMeta::blur($this->media_path),
            'heading' => $this->heading,
            'caption' => $this->caption,
            'link_url' => $this->link_url,
            'link_label' => $this->link_label,
            'caption_position' => $this->caption_position?->value,
            'kicker' => $this->kicker,
            'link2_url' => $this->link2_url,
            'link2_label' => $this->link2_label,
            // The phone picture, resolved exactly like `url`; null when unset.
            'mobile_url' => $this->mobile_media_path ? MediaUrl::for($this->mobile_media_path) : null,
            'mobile_alt' => $this->mobile_media_path ? MediaMeta::alt($this->mobile_media_path) : null,
            'mobile_focus' => MediaMeta::focus($this->mobile_media_path),
            'mobile_blur' => MediaMeta::blur($this->mobile_media_path),
            'text_tone' => $this->text_tone->value,
            'overlay' => $this->overlay->value,
            'duration_ms' => $this->duration_ms,
            'fit' => $this->fit->value,
        ];
    }
}
