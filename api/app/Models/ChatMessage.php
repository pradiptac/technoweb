<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line of a conversation.
 *
 * `role` is `user`, `assistant` or `system`. A system message holds the
 * assistant's instructions and whatever was retrieved to answer with, and it is
 * stored so a conversation can be understood afterwards — never returned to a
 * browser. `ChatConversation::visibleMessages()` is the boundary.
 *
 * Written once and never edited, so there is no `updated_at`.
 */
class ChatMessage extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'chat_conversation_id', 'role', 'content', 'intent',
        'grounded', 'sources', 'actions', 'rating', 'rating_note', 'tokens', 'created_at',
    ];

    protected function casts(): array
    {
        return [
            'grounded' => 'boolean',
            /*
             * A list, not a map. MySQL's JSON type reorders object keys by
             * length and then alphabetically — the bug `App\Casts\SpecSheet`
             * exists for — and these are ranked, so the order is the answer.
             */
            'sources' => 'array',
            'actions' => 'array',
            'rating' => 'integer',
            'tokens' => 'integer',
            'created_at' => 'datetime',
        ];
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(ChatConversation::class, 'chat_conversation_id');
    }
}
