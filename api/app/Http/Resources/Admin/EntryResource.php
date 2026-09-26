<?php

namespace App\Http\Resources\Admin;

use App\Http\Resources\Concerns\IncludesAnswerContent;
use App\Http\Resources\Concerns\IncludesCustomFields;
use App\Models\Entry;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Entry */
class EntryResource extends JsonResource
{
    use IncludesAnswerContent, IncludesCustomFields;

    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show', '*.store', '*.update');

        return [
            'id' => $this->id,
            'content_type_id' => $this->content_type_id,
            'title' => $this->title,
            'slug' => $this->slug,
            'path' => $this->publicPath(),
            'summary' => $this->summary,
            'body' => $this->when($detail, $this->body),
            'image_path' => $this->image_path,
            'image' => $this->image_path ? asset('storage/'.$this->image_path) : null,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'published_at' => $this->published_at?->toIso8601String(),
            'sort_order' => (int) $this->sort_order,
            'faqs' => $this->adminFaqs(),
            'answer_blocks' => $this->adminAnswerBlocks(),
            ...$this->adminCustomFields(),
            'seo' => $this->when($detail, fn () => SeoOverrideArray::from($this->seo)),
            'seo_defaults' => $this->when($detail, fn () => $this->resolvedSeo()),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
