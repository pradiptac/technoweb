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
            /*
             * Routed through an authorised download endpoint, never a public
             * path. Deliberately keyed on the attachment alone so building this
             * URL never has to touch the parent ticket relation. Staff and
             * customers hit different endpoints — a customer's download route
             * 404s on staff tokens, since it checks customer_id ownership.
             *
             * **A browser cannot follow this, and the frontend must not render
             * it as an href.** It needs `Authorization: Bearer`, which a
             * navigation does not send — and a navigation also sends
             * `Accept: text/html`, so the refusal comes back as a 500 from
             * Laravel trying to redirect to a `login` route this application
             * does not define, rather than as a clean 401. Both consoles did
             * exactly that for months and no attachment could be opened by
             * anyone. They now link at their own proxy routes, which attach the
             * token server-side:
             *
             *   /api/admin/ticket-attachments/{id}
             *   /api/portal/ticket-attachments/{id}
             *
             * This key stays because it is correct for an API client that holds
             * a token. It is not correct for a link.
             */
            'url' => $request->routeIs('api.v1.admin.*')
                ? route('api.v1.admin.ticket-attachments.download', ['attachment' => $this->id])
                : route('api.v1.tickets.attachments.download', ['attachment' => $this->id]),
            'size' => (int) $this->size,
            'mime' => $this->mime,
        ];
    }
}
