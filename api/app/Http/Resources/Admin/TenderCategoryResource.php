<?php

namespace App\Http\Resources\Admin;

use App\Models\TenderCategory;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A tender category as the console edits it, with how many tenders sit in
 * it — the figure the delete confirmation quotes.
 *
 * @mixin TenderCategory
 */
class TenderCategoryResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'description' => $this->description,
            'sort_order' => (int) $this->sort_order,
            'is_active' => (bool) $this->is_active,
            'tenders_count' => (int) ($this->tenders_count ?? 0),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
