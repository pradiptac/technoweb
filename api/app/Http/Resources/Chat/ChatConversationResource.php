<?php

namespace App\Http\Resources\Chat;

use App\Models\ChatConversation;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A conversation, as its own visitor may see it.
 *
 * **`session_token` is absent**, and so is the IP. The token is returned once,
 * on the response that creates the conversation, the way an order's access
 * token is — a credential that appears in every read of the thing it protects
 * is a credential in every log and every browser cache.
 *
 * Messages come from `visibleMessages`, so a system message — which holds the
 * instructions and the retrieved context — cannot reach a browser. Structural
 * rather than a filter somebody has to remember, the call the ticket module
 * makes with `publicMessages`.
 *
 * @mixin ChatConversation
 */
class ChatConversationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'status' => $this->status,
            'message_count' => (int) $this->message_count,
            'messages' => ChatMessageResource::collection($this->whenLoaded('visibleMessages')),
        ];
    }
}
