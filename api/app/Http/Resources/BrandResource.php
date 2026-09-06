<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BrandResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'logo' => $this->logoUrl(),
        ];
    }

    /**
     * `?v=<updated_at>`, the rule `Admin\MediaResource` already follows.
     *
     * `logo_path` is a plain stored path, edited in place — a resize, a
     * replace, or (as this catalogue just did) swapping a generated
     * placeholder for the manufacturer's real logo, all rewrite the same file
     * on disk without the path changing. Without a version, a browser that
     * had already fetched the old bytes goes on serving them from cache.
     */
    private function logoUrl(): ?string
    {
        if (! $this->logo_path) {
            return null;
        }

        return asset('storage/'.$this->logo_path).'?v='.($this->updated_at?->timestamp ?? 0);
    }
}
