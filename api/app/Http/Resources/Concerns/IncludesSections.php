<?php

namespace App\Http\Resources\Concerns;

use App\Support\DetailTemplates;
use App\Support\PageSections\RecordSections;

/**
 * A record's builder sections (0.129.0, `RecordSections`), in the two shapes
 * the two sides want.
 *
 * The console reads the list as stored, to edit it, with a URL for every
 * stored path so a picture field can show what it holds. The site reads the
 * presented sections — and only on the record's own page, and only while the
 * record is laid out as sections: a solution listed inside an industry's
 * read carries no key, and neither does one whose page draws its written
 * body. The body itself is still sent either way.
 */
trait IncludesSections
{
    /**
     * `body_layout` on every row; the list and its media on a detail read.
     *
     * @return array<string, mixed>
     */
    protected function adminSections(bool $detail): array
    {
        return [
            'body_layout' => $this->resource->getAttribute('body_layout') ?: RecordSections::LAYOUT_BODY,
            'blocks' => $this->when($detail, fn () => $this->resource->getAttribute('blocks') ?? []),
            'blocks_media' => $this->when($detail, fn () => (object) RecordSections::mediaUrls($this->resource->getAttribute('blocks') ?? [])),
        ];
    }

    /**
     * The presented sections, when this resource is the page (`$isPage`, the
     * `withSchema()` flag) and the page draws them.
     */
    protected function publicSections(bool $isPage): mixed
    {
        return $this->when(
            $isPage && RecordSections::inUse($this->resource),
            fn () => RecordSections::present($this->resource),
        );
    }

    /**
     * The active detail template for this kind of record (0.161.0,
     * `DetailTemplates`), when this resource is the page: `{id, sections}`
     * with the ordinary sections presented and the record blocks passed as
     * `{id, type, data}`. Absent — not null — when none is active, so a page
     * without one reads byte for byte as it did.
     */
    protected function publicDetailTemplate(string $type, bool $isPage): mixed
    {
        return $this->when(
            $isPage && DetailTemplates::active($type) !== null,
            fn () => DetailTemplates::publicRead($type),
        );
    }
}
