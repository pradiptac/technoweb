<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class TicketAttachment extends Model
{
    protected $fillable = ['ticket_id', 'ticket_message_id', 'disk', 'path', 'filename', 'mime', 'size'];

    public function ticket(): BelongsTo
    {
        return $this->belongsTo(Ticket::class);
    }

    public function message(): BelongsTo
    {
        return $this->belongsTo(TicketMessage::class, 'ticket_message_id');
    }

    /**
     * Attachments live on a private disk and are streamed through an
     * authorised controller — never exposed as a public URL, because a ticket
     * attachment can contain network diagrams, logs or credentials.
     */
    public function temporaryUrl(int $minutes = 10): string
    {
        return Storage::disk($this->disk)->temporaryUrl($this->path, now()->addMinutes($minutes));
    }
}
