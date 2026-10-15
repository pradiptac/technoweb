<?php

namespace App\Http\Resources\Admin;

use App\Enums\DownloadSource;
use App\Models\Download;
use App\Support\Downloads\DownloadFiles;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A download as the console edits it: the stored choices, what the file is,
 * how often it has been fetched, and — on the detail read — what it is
 * attached to.
 *
 * `private_path` is never returned: it is a location on the private disk,
 * and the console reaches the file through `GET /admin/downloads/{id}/file`.
 * `file_missing` is the row that says it has a file while nothing answers
 * for it — a library file since deleted, or an upload gone from the disk.
 *
 * @mixin Download
 */
class DownloadResource extends JsonResource
{
    private bool $detail = false;

    public function detail(): static
    {
        $this->detail = true;

        return $this;
    }

    public function toArray(Request $request): array
    {
        $file = DownloadFiles::info($this->resource);
        $claims = $this->source === DownloadSource::Upload ? filled($this->private_path) : filled($this->file_path);

        return [
            'id' => $this->id,
            'title' => $this->title,
            'summary' => $this->summary,
            'version' => $this->version,
            'released_on' => $this->released_on?->toDateString(),
            'access' => $this->access->value,
            'access_label' => $this->access->label(),
            'source' => $this->source->value,
            'source_label' => $this->source->label(),
            'file_path' => $this->source === DownloadSource::Library ? $this->file_path : null,
            'file' => $file,
            'has_file' => $file !== null,
            'file_missing' => $claims && ($file === null || ($this->detail && $this->source === DownloadSource::Upload && ! DownloadFiles::exists($this->resource))),
            'status' => $this->status->value,
            'sort_order' => (int) $this->sort_order,
            'download_count' => (int) $this->download_count,
            'download_category_id' => $this->download_category_id,
            'category' => $this->relationLoaded('category') && $this->category
                ? ['id' => $this->category->id, 'name' => $this->category->name, 'is_active' => (bool) $this->category->is_active]
                : null,
            'attached_count' => $this->when(
                isset($this->products_count, $this->store_products_count),
                fn () => (int) $this->products_count + (int) $this->store_products_count,
            ),
            $this->mergeWhen($this->detail, fn () => [
                'product_ids' => $this->products->pluck('id')->values(),
                'store_product_ids' => $this->storeProducts->pluck('id')->values(),
                'products' => $this->products->map(fn ($p) => ['id' => $p->id, 'name' => $p->name])->values(),
                'store_products' => $this->storeProducts->map(fn ($p) => ['id' => $p->id, 'name' => $p->name])->values(),
            ]),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
