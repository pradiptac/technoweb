<?php

namespace App\Http\Resources\Admin;

use App\Models\CannedReply;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A saved reply as the console reads it.
 *
 * `body` is the stored text with its `{{placeholders}}` on the management
 * screen, and the *filled* text on the per-ticket read — the controller sets
 * the attribute before the resource sees it, so the console inserts what it
 * is given and never learns the placeholder rules.
 */
/** @mixin CannedReply */
class CannedReplyResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'body' => $this->body,
            'sort_order' => (int) $this->sort_order,
            'created_by' => $this->whenLoaded('author', fn () => $this->author ? [
                'id' => $this->author->id,
                'name' => $this->author->name,
            ] : null),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
