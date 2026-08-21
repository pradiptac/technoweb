<?php

namespace App\Http\Resources\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MediaResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'filename' => $this->filename,
            // The path is what gets stored on the owning record
            // (cover_image_path, og_image_path); the url is for display.
            'path' => $this->path,
            'url' => $this->url(),
            'mime' => $this->mime,
            'size' => (int) $this->size,
            'width' => $this->width,
            'height' => $this->height,
            'alt_text' => $this->alt_text,
            'uploaded_by' => $this->whenLoaded('uploader', fn () => $this->uploader?->name),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
