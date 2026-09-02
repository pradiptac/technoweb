<?php

namespace App\Http\Resources\Chat;

use App\Models\ChatMessage;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One line of a conversation, as a visitor may see it.
 *
 * `intent` and `tokens` are absent deliberately — they are for the console.
 * `grounded` is here because the interface uses it: an answer that stood on
 * nothing gets the "we could not confirm this" treatment rather than being
 * dressed up as an answer.
 *
 * @mixin ChatMessage
 */
class ChatMessageResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'role' => $this->role,
            'content' => $this->content,
            'grounded' => (bool) $this->grounded,
            // Title, label and a path. No excerpt: that was the model's
            // working, not the answer, and it is already in the reply.
            'sources' => $this->sources ?? [],
            'at' => $this->created_at?->toIso8601String(),
        ];
    }
}
