<?php

namespace App\Http\Controllers\Concerns;

use App\Models\Ticket;
use App\Models\TicketMessage;
use App\Support\Tickets\AttachmentStore;
use Illuminate\Http\Request;

/**
 * Shared by the customer and admin ticket controllers so the storage logic
 * — hashed path, private disk — exists in exactly one place. That place is
 * now `AttachmentStore`, which the mailbox piper calls as well; this trait
 * is the HTTP-shaped door onto it.
 */
trait StoresTicketAttachments
{
    private function storeAttachments(Request $request, Ticket $ticket, ?TicketMessage $message = null): void
    {
        foreach ($request->file('attachments', []) as $file) {
            AttachmentStore::storeUpload($ticket, $message, $file);
        }
    }
}
