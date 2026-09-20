<?php

namespace App\Http\Resources;

use App\Http\Resources\Concerns\IncludesSeo;
use App\Models\Page;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Page */
class PageResource extends JsonResource
{
    use IncludesSeo;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'slug' => $this->slug,
            'body' => $this->body,
            'template' => $this->template,
            'published_at' => $this->published_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            'faqs' => FaqResource::collection($this->whenLoaded('faqs')),
            'seo' => $this->seo(),
        ];
    }
}
