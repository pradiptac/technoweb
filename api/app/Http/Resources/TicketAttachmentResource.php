<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TicketAttachmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'filename' => $this->filename,
            // Routed through an authorised download endpoint, never a public
            // path. Deliberately keyed on the attachment alone so building this
            // URL never has to touch the parent ticket relation. Staff and
            // customers hit different endpoints — a customer's download route
            // 404s on staff tokens, since it checks customer_id ownership.
            'url' => $request->routeIs('api.v1.admin.*')
                ? route('api.v1.admin.ticket-attachments.download', ['attachment' => $this->id])
                : route('api.v1.tickets.attachments.download', ['attachment' => $this->id]),
            'size' => (int) $this->size,
            'mime' => $this->mime,
        ];
    }
}
