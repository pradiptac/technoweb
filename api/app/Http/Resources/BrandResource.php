<?php

namespace App\Http\Resources;

use App\Http\Resources\Concerns\IncludesAnswerContent;
use App\Http\Resources\Concerns\IncludesSchema;
use App\Models\Brand;
use App\Support\MediaUrl;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Brand */
class BrandResource extends JsonResource
{
    use IncludesAnswerContent, IncludesSchema;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'logo' => $this->logoUrl(),
            // "Gold Partner" or null. What `/certifications` prints under the logo.
            'partner_tier' => $this->partner_tier,
            'faqs' => $this->publicFaqs(),
            // The published blocks, in order, with the heading each renders under.
            'answer_blocks' => $this->publicAnswerBlocks(),
            // What this record is connected to, on the page only (`EntityLinks`).
            'entity' => $this->entity(),
            // An FAQPage over the FAQs and question blocks; absent under two entries.
            'faq_schema' => $this->faqSchema(),
        ];
    }

    /**
     * `?v=<updated_at>`, the rule `Admin\MediaResource` already follows.
     *
     * `logo_path` is a plain stored path, edited in place — a resize, a
     * replace, or (as this catalogue just did) swapping a generated
     * placeholder for the manufacturer's real logo, all rewrite the same file
     * on disk without the path changing. Without a version, a browser that
     * had already fetched the old bytes goes on serving them from cache.
     */
    private function logoUrl(): ?string
    {
        if (! $this->logo_path) {
            return null;
        }

        return MediaUrl::for($this->logo_path, $this->updated_at?->timestamp);
    }
}
