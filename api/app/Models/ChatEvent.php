<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Anything worth counting later that is not a message.
 *
 * Opened, quick action pressed, retrieval found nothing, lead offered, lead
 * captured. Recorded from the start because analytics retro-fitted has no
 * history on the day somebody asks for it — and because "how often does it
 * fail to answer" is the figure that improves the website, which is what §42
 * of the specification is actually about.
 *
 * `context` is an allowlist built at the call site, never a request body. The
 * activity log learned that one: a body carries whatever somebody typed.
 */
class ChatEvent extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['chat_conversation_id', 'type', 'context', 'created_at'];

    protected function casts(): array
    {
        return ['context' => 'array', 'created_at' => 'datetime'];
    }

    public static function record(?ChatConversation $conversation, string $type, array $context = []): void
    {
        static::create([
            'chat_conversation_id' => $conversation?->id,
            'type' => $type,
            'context' => $context ?: null,
            'created_at' => now(),
        ]);
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(ChatConversation::class, 'chat_conversation_id');
    }
}
