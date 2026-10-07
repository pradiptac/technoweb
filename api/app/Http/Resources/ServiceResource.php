<?php

namespace App\Http\Resources;

use App\Http\Resources\Concerns\IncludesAnswerContent;
use App\Http\Resources\Concerns\IncludesCustomFields;
use App\Http\Resources\Concerns\IncludesSchema;
use App\Http\Resources\Concerns\IncludesSeo;
use App\Models\Service;
use App\Support\MediaMeta;
use App\Support\StructuredData;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Service */
class ServiceResource extends JsonResource
{
    use IncludesAnswerContent, IncludesCustomFields, IncludesSchema, IncludesSeo;

    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show');

        return [
            'id' => $this->id,
            'title' => $this->title,
            'slug' => $this->slug,
            // The sitemap's `lastmod`: a record's own last change, never the build time. `docs/seo-audit-2026-09-18.md`, F2.
            'updated_at' => $this->updated_at?->toIso8601String(),
            'summary' => $this->summary,
            'icon' => $this->icon,
            // The tab it is drawn under; null is "Other services". Present
            // wherever the controller loaded it, which both public reads do.
            'category' => $this->whenLoaded('category', fn () => $this->category ? [
                'id' => $this->category->id,
                'name' => $this->category->name,
                'slug' => $this->category->slug,
            ] : null),
            // The picture, the shape a solution's `hero_image*` takes.
            // The chips on its card, in order; [] when there are none.
            'highlights' => $this->highlights ?? [],
            'image' => $this->image_path ? asset('storage/'.$this->image_path) : null,
            'image_alt' => MediaMeta::alt($this->image_path),
            'image_focus' => MediaMeta::focus($this->image_path),
            'image_blur' => MediaMeta::blur($this->image_path),
            'body' => $this->when($detail, $this->body),
            'faqs' => FaqResource::collection($this->whenLoaded('faqs')),
            // The published blocks, in order, with the heading each renders under.
            'answer_blocks' => $this->publicAnswerBlocks(),
            // What this record is connected to, on the page only (`EntityLinks`).
            'entity' => $this->entity(),
            // An FAQPage over the FAQs and question blocks; absent under two entries.
            'faq_schema' => $this->faqSchema(),
            // Custom fields (docs/custom-content.md) — see IncludesCustomFields.
            ...$this->publicCustomFields(),
            'seo' => $this->seo(),
            /*
             * The page's JSON-LD, built server-side.
             *
             * Gated on `withSchema()` rather than on the route, because a nested
             * resource inherits its parent's route name — twenty products inside
             * /solutions/{slug} would each build a Product graph and lazy-load a
             * brand and a category. See the IncludesSchema trait.
             *
             * The frontend renders it through `JsonLd`, which escapes `<`. That
             * boundary stays there: JSON.stringify does not escape it, and a CMS
             * field containing `</script>` would close the block.
             */
            'schema' => $this->schema(fn () => StructuredData::service($this->resource)),
        ];
    }
}
