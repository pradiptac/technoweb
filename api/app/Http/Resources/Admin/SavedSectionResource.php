<?php

namespace App\Http\Resources\Admin;

use App\Enums\PageSectionType;
use App\Models\SavedSection;
use App\Support\PageSections\SectionPresenter;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A library item. The list carries what a picker needs — the kind, the name,
 * the first section's type and how many sections; the detail adds the
 * sections as stored, a URL per stored path (the page resource's
 * `blocks_media` rule), the public shape for a preview, and where it is
 * placed linked.
 *
 * @mixin SavedSection
 */
class SavedSectionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show', '*.store', '*.update');
        $blocks = $this->blocks ?? [];
        $type = PageSectionType::tryFrom((string) ($blocks[0]['type'] ?? ''));

        return [
            'id' => $this->id,
            'kind' => $this->kind,
            'name' => $this->name,
            'description' => $this->description,
            'category' => $this->category,
            'category_label' => $this->category ? SavedSection::CATEGORIES[$this->category] ?? null : null,
            'type' => $type?->value,
            'type_label' => $type?->label(),
            'count' => count($blocks),
            'author' => $this->whenLoaded('author', fn () => $this->author?->name),
            'blocks' => $this->when($detail, $blocks),
            'blocks_media' => $this->when($detail, fn () => (object) self::mediaUrls($blocks)),
            'sections' => $this->when($detail, fn () => SectionPresenter::present($blocks)),
            'linked_from' => $this->when($detail && $this->kind === 'section', fn () => $this->linkedFrom()),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }

    /**
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
