<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BlogPostResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show');

        return [
            'id' => $this->id,
            'title' => $this->title,
            'slug' => $this->slug,
            'excerpt' => $this->excerpt,
            'body' => $this->when($detail, $this->body),
            'cover_image' => $this->cover_image_path ? asset('storage/'.$this->cover_image_path) : null,
            'published_at' => $this->published_at?->toIso8601String(),
            'reading_minutes' => $this->reading_minutes,
            'author' => $this->whenLoaded('author', fn () => ['name' => $this->author->name]),
            'seo' => $this->when($detail, fn () => new SeoResource($this->resolvedSeo())),
        ];
    }
}
