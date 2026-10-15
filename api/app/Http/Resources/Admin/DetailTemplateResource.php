<?php

namespace App\Http\Resources\Admin;

use App\Models\DetailTemplate;
use App\Support\DetailTemplates;
use App\Support\PageSections\RecordSections;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A detail template. The list carries what a screen of them needs; the
 * detail adds the sections as stored and a URL for every stored path — the
 * library item's shape. `cache_tag` is the public tag a save purges, so the
 * console names no tag of its own.
 *
 * @mixin DetailTemplate
 */
class DetailTemplateResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show', '*.store', '*.update', '*.activate', '*.deactivate');
        $blocks = $this->blocks ?? [];
        $type = DetailTemplates::TYPES[$this->type] ?? null;

        return [
            'id' => $this->id,
            'type' => $this->type,
            'type_label' => $type['label'] ?? $this->type,
            'name' => $this->name,
            'is_active' => $this->is_active,
            'count' => count($blocks),
            'cache_tag' => $type['tag'] ?? null,
            'author' => $this->whenLoaded('author', fn () => $this->author?->name),
            'blocks' => $this->when($detail, $blocks),
            'blocks_media' => $this->when($detail, fn () => (object) RecordSections::mediaUrls($blocks)),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
