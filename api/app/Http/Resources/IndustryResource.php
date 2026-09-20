<?php

namespace App\Http\Resources;

use App\Http\Resources\Concerns\IncludesSeo;
use App\Models\Industry;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Industry */
class IndustryResource extends JsonResource
{
    use IncludesSeo;

    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show');

        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            // The sitemap's `lastmod`: a record's own last change, never the build time. `docs/seo-audit-2026-09-18.md`, F2.
            'updated_at' => $this->updated_at?->toIso8601String(),
            'summary' => $this->summary,
            'icon' => $this->icon,
            'body' => $this->when($detail, $this->body),
            'solutions' => SolutionResource::collection($this->whenLoaded('solutions')),
            'seo' => $this->seo(),
        ];
    }
}
