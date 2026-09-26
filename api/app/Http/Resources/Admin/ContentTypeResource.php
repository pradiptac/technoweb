<?php

namespace App\Http\Resources\Admin;

use App\Models\ContentType;
use App\Support\CustomFields\CustomFields;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin ContentType */
class ContentTypeResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show', '*.store', '*.update');

        return [
            'id' => $this->id,
            'name' => $this->name,
            'plural' => $this->plural,
            'slug' => $this->slug,
            'path' => $this->publicPath(),
            'icon' => $this->icon,
            'description' => $this->description,
            'has_body' => (bool) $this->has_body,
            'has_image' => (bool) $this->has_image,
            'archive_enabled' => (bool) $this->archive_enabled,
            'per_page' => (int) $this->per_page,
            'sort' => $this->sort,
            'schema_type' => $this->schema_type,
            'sort_order' => (int) $this->sort_order,
            'is_active' => (bool) $this->is_active,
            'entries_count' => $this->whenCounted('entries'),
            'published_count' => $this->when($this->resource->getAttribute('published_count') !== null, fn () => (int) $this->resource->getAttribute('published_count')),
            // Which field groups apply, by name, so the type's screen can say
            // what its entries carry without the console composing the key.
            'field_groups' => $this->when($detail, fn () => CustomFields::groupsFor($this->target())
                ->map(fn ($g) => ['id' => $g->id, 'name' => $g->name, 'fields_count' => $g->fields->count()])
                ->values()),
            'target' => $this->target(),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
