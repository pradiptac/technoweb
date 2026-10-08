<?php

namespace App\Http\Resources\Admin;

use App\Models\DownloadCategory;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A download category as the console edits it, with how many downloads sit
 * in it — the figure the delete confirmation quotes.
 *
 * @mixin DownloadCategory
 */
class DownloadCategoryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'description' => $this->description,
            'sort_order' => (int) $this->sort_order,
            'is_active' => (bool) $this->is_active,
            'downloads_count' => (int) ($this->downloads_count ?? 0),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
