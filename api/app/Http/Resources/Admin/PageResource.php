<?php

namespace App\Http\Resources\Admin;

use App\Http\Resources\Concerns\IncludesAnswerContent;
use App\Http\Resources\Concerns\IncludesCustomFields;
use App\Models\Page;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Page */
class PageResource extends JsonResource
{
    use IncludesAnswerContent, IncludesCustomFields;

    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show', '*.store', '*.update');

        return [
            'id' => $this->id,
            'title' => $this->title,
            'slug' => $this->slug,
            'body' => $this->when($detail, $this->body),
            'template' => $this->template,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'published_at' => $this->published_at?->toIso8601String(),
            'faqs' => $this->adminFaqs(),
            // Every block, drafts included, for the AEO tab's repeater.
            'answer_blocks' => $this->adminAnswerBlocks(),
            // Custom fields (docs/custom-content.md) — see IncludesCustomFields.
            ...$this->adminCustomFields(),
            'seo' => $this->when($detail, fn () => SeoOverrideArray::from($this->seo)),
            'seo_defaults' => $this->when($detail, fn () => $this->resolvedSeo()),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
