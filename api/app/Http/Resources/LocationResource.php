<?php

namespace App\Http\Resources;

use App\Models\Location;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A place the company works in, as the public site sees it.
 *
 * `is_active` and `sort_order` are absent: they are decisions about the admin
 * list, and a public consumer that can read them is one that will eventually
 * branch on them.
 *
 * The tree comes through as `ancestors` and `children` rather than as a
 * `parent_id` the frontend would have to walk. A page about Salt Lake wants to
 * say where Salt Lake is, and a page about West Bengal wants to list the cities
 * in it — both are one render, and neither should cost a round trip per level.
 */
class LocationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'name' => $this->name,
            'slug' => $this->slug,
            'level' => $this->level?->value,
            'country' => $this->country,
            'full_name' => $this->fullName(),
            'office_address' => $this->office_address,
            'response_time' => $this->response_time,
            'summary' => $this->summary,

            // Nearest first, so a breadcrumb reads outward without reversing it.
            'ancestors' => array_map(
                fn (Location $a) => ['name' => $a->name, 'slug' => $a->slug, 'level' => $a->level?->value],
                $this->ancestors(),
            ),
            'children' => $this->whenLoaded('children', fn () => $this->children
                ->where('is_active', true)
                ->map(fn (Location $c) => ['name' => $c->name, 'slug' => $c->slug, 'level' => $c->level?->value])
                ->values()->all()),
            'services' => $this->whenLoaded('services', fn () => $this->services
                ->map(fn ($s) => ['title' => $s->title, 'slug' => $s->slug])->all()),
            'solutions' => $this->whenLoaded('solutions', fn () => $this->solutions
                ->map(fn ($s) => ['title' => $s->title, 'slug' => $s->slug])->all()),
        ];
    }
}
