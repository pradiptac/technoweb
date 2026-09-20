<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One email the support mailbox handed over, and what became of it.
 *
 * The unique index on `message_id` is what makes piping idempotent — see the
 * migration. Outcomes: `processing` while a run holds it, then
 * `ticket_created`, `reply_added`, `skipped:<reason>` or `failed`.
 */
class InboundEmail extends Model
{
    public const CREATED = 'ticket_created';

    public const REPLIED = 'reply_added';

    public const FAILED = 'failed';

    public const PROCESSING = 'processing';

    protected $fillable = [
        'message_id', 'provider', 'uid', 'from_email', 'from_name', 'subject',
        'in_reply_to', 'received_at', 'outcome', 'reason', 'ticket_id', 'ticket_message_id',
    ];

    protected function casts(): array
    {
        return ['received_at' => 'datetime', 'uid' => 'integer'];
    }

    public static function skipped(string $reason): string
    {
        return "skipped:{$reason}";
    }

    /** @return BelongsTo<Ticket, $this> */
    public function ticket(): BelongsTo
    {
        return $this->belongsTo(Ticket::class);
    }

    /** @return BelongsTo<TicketMessage, $this> */
    public function message(): BelongsTo
    {
        return $this->belongsTo(TicketMessage::class, 'ticket_message_id');
    }
}
