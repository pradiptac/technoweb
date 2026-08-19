<?php

namespace App\Http\Resources;

use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TicketMessageResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'body' => $this->body,
            'is_internal' => (bool) $this->is_internal,
            'author' => [
                'id' => $this->author_id,
                'name' => $this->author?->name ?? 'Deleted user',
                'type' => $this->author instanceof Customer ? 'customer' : 'staff',
            ],
            'attachments' => TicketAttachmentResource::collection($this->whenLoaded('attachments')),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
