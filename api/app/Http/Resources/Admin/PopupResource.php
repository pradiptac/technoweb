<?php

namespace App\Http\Resources\Admin;

use App\Models\Popup;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A popup, as the console edits it.
 *
 * Carries **both** `image_path` and `image`, and that is not redundancy:
 * `CoverField` previews from a URL and cannot derive one from a stored path,
 * while the form posts the path back because that is what the record holds.
 * The slide repeater learned this the hard way — it kept only the path and
 * rendered twelve empty placeholders for pictures that were plainly there.
 *
 * It also carries the raw `sections` and `paths`, unlike the public resource,
 * because the form has to redraw the checklist somebody ticked.
 *
 * @mixin Popup
 */
class PopupResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'status' => $this->status?->value,

            'image_path' => $this->image_path,
            'image' => filled($this->image_path) ? asset('storage/'.$this->image_path) : null,

            'link_url' => $this->link_url,
            'link_new_tab' => (bool) $this->link_new_tab,

            'sections' => $this->sections ?? [],
            'paths' => $this->paths ?? [],
            /*
             * What the sections and paths actually resolve to, so the form can
             * show it back. An editor ticking "Store" should be able to see
             * that it means `/store/*` without publishing and going to look —
             * the same reason `SiteSection::options()` sends the path beside
             * the label.
             */
            'match_paths' => $this->matchPatterns(),

            'size' => $this->size?->value,
            'frequency' => $this->frequency?->value,
            'delay_ms' => (int) $this->delay_ms,

            'starts_at' => $this->starts_at?->toIso8601String(),
            'ends_at' => $this->ends_at?->toIso8601String(),
            'sort_order' => (int) $this->sort_order,

            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
