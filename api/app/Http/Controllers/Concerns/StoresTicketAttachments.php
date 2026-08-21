<?php

namespace App\Http\Controllers\Concerns;

use App\Models\Ticket;
use App\Models\TicketMessage;
use Illuminate\Http\Request;

/**
 * Shared by the customer and admin ticket controllers so the storage logic
 * — hashed path, private disk — exists in exactly one place.
 */
trait StoresTicketAttachments
{
    private function storeAttachments(Request $request, Ticket $ticket, ?TicketMessage $message = null): void
    {
        foreach ($request->file('attachments', []) as $file) {
            // Private disk, hashed name — the original filename is metadata only,
            // so a crafted name cannot influence the stored path.
            $path = $file->store("tickets/{$ticket->id}", 'local');

            $ticket->attachments()->create([
                'ticket_message_id' => $message?->id,
                'disk' => 'local',
                'path' => $path,
                'filename' => $file->getClientOriginalName(),
                'mime' => $file->getClientMimeType(),
                'size' => $file->getSize(),
            ]);
        }
    }
}
