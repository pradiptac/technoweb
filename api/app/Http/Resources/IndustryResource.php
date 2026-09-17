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
            'summary' => $this->summary,
            'icon' => $this->icon,
            'body' => $this->when($detail, $this->body),
            'solutions' => SolutionResource::collection($this->whenLoaded('solutions')),
            'seo' => $this->seo(),
        ];
    }
}
