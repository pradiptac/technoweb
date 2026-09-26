<?php

namespace App\Http\Resources\Admin;

use App\Http\Resources\Concerns\IncludesAnswerContent;
use App\Models\Page;
use App\Support\PageSections\SectionPresenter;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Page */
class PageResource extends JsonResource
{
    use IncludesAnswerContent;

    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show', '*.store', '*.update');

        return [
            'id' => $this->id,
            'title' => $this->title,
            'slug' => $this->slug,
            'body' => $this->when($detail, $this->body),
            'template' => $this->template,
            // The builder's sections as stored — paths and ids — for the
            // console to edit; `blocks_media` a URL for every stored path so
            // a picture field can show what it holds; `sections` the public
            // shape, for the saved-page preview (2026-09-26).
            'blocks' => $this->when($detail, fn () => $this->blocks ?? []),
            'blocks_media' => $this->when($detail, fn () => (object) self::mediaUrls($this->blocks ?? [])),
            'sections' => $this->when($detail, fn () => SectionPresenter::present($this->blocks, $this->resource)),
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'published_at' => $this->published_at?->toIso8601String(),
            'faqs' => $this->adminFaqs(),
            // Every block, drafts included, for the AEO tab's repeater.
            'answer_blocks' => $this->adminAnswerBlocks(),
            'seo' => $this->when($detail, fn () => SeoOverrideArray::from($this->seo)),
            'seo_defaults' => $this->when($detail, fn () => $this->resolvedSeo()),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }

    /**
     * Every `*_path` value anywhere in the sections, mapped to its URL.
     *
     * @param  array<mixed>  $blocks
     * @return array<string, string>
     */
    private static function mediaUrls(array $blocks): array
    {
        $urls = [];
        array_walk_recursive($blocks, function ($value, $key) use (&$urls) {
            if (is_string($key) && str_ends_with($key, '_path') && is_string($value) && $value !== '') {
                $urls[$value] = asset('storage/'.$value);
            }
        });

        return $urls;
    }
}
