<?php

namespace App\Http\Resources;

use App\Models\Customer;
use App\Models\TicketMessage;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin TicketMessage */
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
            // The customer's verdict on a staff reply: null until given. The
            // reason travels to both sides — the customer wrote it and may
            // re-word it, the desk is who it is for.
            'rating' => $this->rating,
            // `getAttribute()`, the analyser's rule for a cast column it types as a string.
            'rated_at' => $this->getAttribute('rated_at')?->toIso8601String(),
            'report_reason' => $this->report_reason,
            'reported_at' => $this->getAttribute('reported_at')?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
