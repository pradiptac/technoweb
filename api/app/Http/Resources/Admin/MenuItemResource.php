<?php

namespace App\Http\Resources\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One item, and its subtree.
 *
 * The console edits a tree, so it is sent a tree — flattening it and asking
 * the browser to rebuild the nesting from `parent_id` is work done twice, and
 * the second implementation is the one that disagrees.
 */
class MenuItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'parent_id' => $this->parent_id,
            'sort_order' => $this->sort_order,
            'label' => $this->label,
            'type' => $this->type->value,
            'type_label' => $this->type->label(),
            'target_type' => $this->target_type,
            'target_id' => $this->target_id,
            'url' => $this->url,
            'icon' => $this->icon,
            'description' => $this->description,
            'open_in_new_tab' => $this->open_in_new_tab,
            'is_active' => $this->is_active,

            /*
             * Where this item currently points, resolved rather than stored.
             *
             * The console shows it so an editor can see that a link is real —
             * and **null is the interesting value**: it means the record was
             * deleted or lost its slug, so the public site will drop this item.
             * Without it a broken entry looks identical to a working one right
             * up until somebody notices the header is short.
             */
            'resolved_url' => $this->resolveUrl(),
            'target_label' => $this->whenLoaded('target', fn () => $this->target?->{$this->type->titleColumn()}),

            'children' => MenuItemResource::collection($this->whenLoaded('children')),
        ];
    }
}
