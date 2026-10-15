<?php

namespace App\Http\Resources;

use App\Models\Download;
use App\Support\Downloads\DownloadFiles;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A download as the public site lists it (docs/downloads.md).
 *
 * **No address of the file, for either kind.** A browser fetches every
 * download through the website's own `/api/downloads/{id}`, which asks
 * `GET /downloads/{id}/file` — that is what counts the download and what
 * asks who is reading a customers-only one. Publishing the library URL here
 * would be a second door past both.
 *
 * `locked` is the one bit a page needs about access: the row is listed for
 * everybody and the button says who may press it. `download_count` is the
 * desk's figure and is not published.
 *
 * @mixin Download
 */
class DownloadResource extends JsonResource
{
    /**
     * A record's own downloads, for its page: the library rows loaded in
     * one query, then the list.
     *
     * @param  iterable<Download>  $downloads
     * @return array<int, array<string, mixed>>
     */
    public static function forRecord(iterable $downloads): array
    {
        DownloadFiles::prime($downloads);

        return self::collection($downloads)->resolve();
    }

    public function toArray(Request $request): array
    {
        $file = DownloadFiles::info($this->resource);

        return [
            'id' => $this->id,
            'title' => $this->title,
            'summary' => $this->summary,
            'version' => $this->version,
            'released_on' => $this->released_on?->toDateString(),
            // The API's words, so the page and the portal print one date.
            'released_label' => $this->released_on?->format('j F Y'),
            'access' => $this->access->value,
            'locked' => $this->isLocked(),
            'category' => $this->relationLoaded('category') && $this->category
                ? ['id' => $this->category->id, 'name' => $this->category->name, 'slug' => $this->category->slug]
                : null,
            'file' => $file === null ? null : [
                'name' => $file['name'],
                'extension' => $file['extension'],
                'size' => $file['size'],
            ],
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
