<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One visitor's conversation with the website assistant.
 *
 * Addressed by `session_token` and never by id — these endpoints are public by
 * necessity, since a visitor has no account, and a sequential id addressed
 * publicly is an invitation to count. `Cart::newToken()` makes the same call
 * for the same reason, and its docblock says why `Str::random` is not what a
 * token addressing somebody's data is made of.
 */
class ChatConversation extends Model
{
    protected $fillable = [
        'session_token', 'customer_id', 'lead_id', 'status',
        'source_url', 'source_path', 'source_title',
        'message_count', 'tokens_used', 'ip', 'last_message_at', 'ended_at',
    ];

    protected $hidden = ['session_token', 'ip'];

    protected function casts(): array
    {
        return [
            'message_count' => 'integer',
            'tokens_used' => 'integer',
            'last_message_at' => 'datetime',
            'ended_at' => 'datetime',
        ];
    }

    /** 64 hex characters from a cryptographic source, like an order's token. */
    public static function newToken(): string
    {
        return bin2hex(random_bytes(32));
    }

    public function messages(): HasMany
    {
        return $this->hasMany(ChatMessage::class)->orderBy('id');
    }

    /**
     * What a visitor is allowed to see of their own conversation.
     *
     * System messages carry the assistant's instructions and the retrieved
     * context, and returning them would hand anybody the system prompt — one
     * of the things §34 of the specification says never to reveal, and the
     * first thing anybody probing a chatbot asks for. Structural, rather than
     * a flag somebody has to remember: the same call the ticket module makes
     * with `publicMessages`.
     */
    public function visibleMessages(): HasMany
    {
        return $this->messages()->whereIn('role', ['user', 'assistant']);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }
}
