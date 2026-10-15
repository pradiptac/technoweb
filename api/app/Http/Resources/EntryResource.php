<?php

namespace App\Http\Resources;

use App\Http\Resources\Concerns\IncludesAnswerContent;
use App\Http\Resources\Concerns\IncludesCustomFields;
use App\Http\Resources\Concerns\IncludesSchema;
use App\Http\Resources\Concerns\IncludesSections;
use App\Http\Resources\Concerns\IncludesSeo;
use App\Models\Entry;
use App\Support\MediaMeta;
use App\Support\MediaUrl;
use App\Support\StructuredData;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * An entry of a custom content type, as the public site reads it.
 *
 * `body` is on the detail read only, like every other record's; `path` is
 * the composed address, so the archive's tiles and the sitemap never build
 * one themselves.
 *
 * @mixin Entry
 */
class EntryResource extends JsonResource
{
    use IncludesAnswerContent, IncludesCustomFields, IncludesSchema, IncludesSections, IncludesSeo;

    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show');

        return [
            'id' => $this->id,
            'title' => $this->title,
            'slug' => $this->slug,
            'path' => $this->publicPath(),
            'type' => $this->whenLoaded('contentType', fn () => [
                'name' => $this->contentType->name,
                'plural' => $this->contentType->plural,
                'slug' => $this->contentType->slug,
                'path' => $this->contentType->publicPath(),
                'icon' => $this->contentType->icon,
                'archive_enabled' => (bool) $this->contentType->archive_enabled,
            ]),
            'summary' => $this->summary,
            'body' => $this->when($detail, $this->body),
            // The builder's sections in place of the written body (0.130.0): on
            // this record's own page only, and only while it is laid out as
            // sections. The body above is still sent.
            'sections' => $this->publicSections($this->includeSchema),
            'image' => $this->image_path ? MediaUrl::for($this->image_path) : null,
            'image_alt' => MediaMeta::alt($this->image_path),
            'image_focus' => MediaMeta::focus($this->image_path),
            'image_blur' => MediaMeta::blur($this->image_path),
            'published_at' => $this->published_at?->toIso8601String(),
            // The sitemap's `lastmod`: the record's own last change.
            'updated_at' => $this->updated_at?->toIso8601String(),
            'faqs' => $this->publicFaqs(),
            'answer_blocks' => $this->publicAnswerBlocks(),
            'entity' => $this->entity(),
            'faq_schema' => $this->faqSchema(),
            ...$this->publicCustomFields(),
            'seo' => $this->seo(),
            // An `Article` or a `WebPage`, as the type says — the page only.
            'schema' => $this->schema(fn () => StructuredData::entry($this->resource)),
        ];
    }
}
