<?php

namespace App\Http\Resources\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LocationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'parent_id' => $this->parent_id,
            'parent' => $this->whenLoaded('parent', fn () => $this->parent
                ? ['id' => $this->parent->id, 'name' => $this->parent->name]
                : null),
            'name' => $this->name,
            'slug' => $this->slug,
            'level' => $this->level?->value,
            'level_label' => $this->level?->label(),
            /*
             * "Salt Lake, Kolkata, West Bengal", built from the tree.
             *
             * Sent rather than left for the console to assemble: it needs the
             * ancestors to do it, which is a query per row on a list screen,
             * and a second implementation of the same sentence would eventually
             * word it differently from the public site.
             */
            'full_name' => $this->fullName(),
            'country' => $this->country,
            'office_address' => $this->office_address,
            'response_time' => $this->response_time,
            'summary' => $this->summary,
            'sort_order' => $this->sort_order,
            'is_active' => $this->is_active,
            /*
             * Whether this place has anything of its own to say.
             *
             * A field rather than something the console works out from the
             * three columns, because it is the single condition standing
             * between a location and a page claiming to serve it — and a rule
             * reimplemented on the other side of the wire is a rule that will
             * disagree with this one eventually.
             */
            'has_local_substance' => $this->hasLocalSubstance(),
            'service_ids' => $this->whenLoaded('services', fn () => $this->services->pluck('id')->all()),
            'solution_ids' => $this->whenLoaded('solutions', fn () => $this->solutions->pluck('id')->all()),
            'services' => $this->whenLoaded('services', fn () => $this->services->map->only(['id', 'title'])->all()),
            'solutions' => $this->whenLoaded('solutions', fn () => $this->solutions->map->only(['id', 'title'])->all()),
            'children_count' => $this->whenCounted('children'),
            'landing_page_count' => $this->whenCounted('landingPages'),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
