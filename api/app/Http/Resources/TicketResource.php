<?php

namespace App\Http\Resources;

use App\Enums\TicketStatus;
use App\Models\Ticket;
use App\Models\TicketEvent;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Ticket */
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
            // The customer has reported a reply on this ticket. Counted from
            // the loaded messages on a detail read, and from a `withCount`
            // the index adds, so the queue can badge a row without a query per row.
            'is_reported' => $this->relationLoaded('messages')
                ? $this->messages->contains(fn ($m) => $m->getAttribute('reported_at') !== null)
                : (int) ($this->reported_messages_count ?? 0) > 0,
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
            /*
             * The trail, oldest first, when the controller loaded it. Both
             * controllers do now: the desk always did (and this resource
             * never emitted it — loaded, joined and thrown away), and the
             * portal since the customer's timeline. `by` is a name the
             * customer already sees as the assigned engineer, or null for
             * their own action.
             */
            'events' => $this->whenLoaded('events', fn () => $this->events
                ->sortBy('id')
                ->values()
                ->map(fn (TicketEvent $e) => [
                    'type' => $e->type,
                    'from' => $e->from_value,
                    'to' => $e->to_value,
                    'by' => $e->user?->getAttribute('name'),
                    'at' => $e->created_at?->toIso8601String(),
                ])),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
