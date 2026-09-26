<?php

namespace App\Http\Resources;

use App\Models\ContentType;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A custom content type, as the public site reads it — the archive's heading
 * and the sitemap's and the menu's list of types.
 *
 * `updated_at` is the newest change among its published entries when the
 * query counted it (`entries_max_updated_at`), so the archive's `lastmod`
 * moves when an entry does, and the type's own row otherwise.
 *
 * @mixin ContentType
 */
class ContentTypeResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $newest = $this->resource->getAttribute('entries_max_updated_at');

        return [
            'name' => $this->name,
            'plural' => $this->plural,
            'slug' => $this->slug,
            'path' => $this->publicPath(),
            'icon' => $this->icon,
            'description' => $this->description,
            'archive_enabled' => (bool) $this->archive_enabled,
            'per_page' => (int) $this->per_page,
            'sort' => $this->sort,
            'schema_type' => $this->schema_type,
            'updated_at' => ($newest ? Carbon::parse($newest) : $this->updated_at)?->toIso8601String(),
        ];
    }
}
