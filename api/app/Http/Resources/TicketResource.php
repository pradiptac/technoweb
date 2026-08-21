<?php

namespace App\Http\Resources;

use App\Enums\TicketStatus;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TicketResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'subject' => $this->subject,
            'description' => $this->when($request->routeIs('*.show'), $this->description),
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            // Drives the admin queue's status <select> — the frontend never
            // re-encodes canTransitionTo()'s rules as a second copy.
            'allowed_transitions' => collect(TicketStatus::cases())
                ->filter(fn (TicketStatus $next) => $this->status->canTransitionTo($next))
                ->map(fn (TicketStatus $next) => ['value' => $next->value, 'label' => $next->label()])
                ->values(),
            'priority' => $this->priority->value,
            'priority_label' => $this->priority->label(),
            'is_overdue' => $this->isOverdue(),
            'due_at' => $this->due_at?->toIso8601String(),
            'category' => $this->whenLoaded('category', fn () => [
                'id' => $this->category->id,
                'name' => $this->category->name,
            ]),
            'assigned_to' => $this->whenLoaded('assignee', fn () => $this->assignee ? [
                'id' => $this->assignee->id,
                'name' => $this->assignee->name,
            ] : null),
            'customer' => new CustomerResource($this->whenLoaded('customer')),
            'messages' => TicketMessageResource::collection($this->whenLoaded('messages')),
            'attachments' => TicketAttachmentResource::collection($this->whenLoaded('attachments')),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
