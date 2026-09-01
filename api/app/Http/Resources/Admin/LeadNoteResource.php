<?php

namespace App\Http\Resources\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** One line on a lead's trail — typed, or written by a status change. */
class LeadNoteResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind,
            'body' => $this->body,
            'context' => $this->context,
            /*
             * The stored name first, and the joined one only as a fallback.
             *
             * The copy is the answer: it is what was true when the line was
             * written, and it survives the account being deleted. Reading the
             * relation first would make a trail rewrite itself when somebody
             * changes their display name.
             */
            'actor_name' => $this->actor_name ?: $this->whenLoaded('author', fn () => $this->author?->name),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
