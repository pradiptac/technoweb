<?php

namespace App\Http\Resources\Admin;

use App\Models\VisitRequest;
use App\Support\Visits\VisitText;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A visit request as the desk works it.
 *
 * `allowed_next` rides on every row, list and detail alike, because the
 * queue's status select is built from it — the rule `LeadResource` settled:
 * a dropdown is a promise, and offering a move the API then refuses is a
 * form arguing with whoever filled it in. `Confirmed` is never in it; a time
 * is set through the confirm endpoint, which is what makes a visit confirmed.
 *
 * The access token is absent from this resource as from every other.
 *
 * @mixin VisitRequest
 */
class VisitRequestResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $status = $this->status;

        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'status' => $status->value,
            'status_label' => $status->label(),
            'is_open' => $status->isOpen(),
            'allowed_next' => $status->allowedNext(),
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'company' => $this->company,
            'customer_id' => $this->customer_id,
            'site_address' => $this->site_address,
            'topic' => $this->topic(),
            'service' => $this->service ? ['id' => $this->service->id, 'title' => $this->service->title, 'slug' => $this->service->slug] : null,
            'solution' => $this->solution ? ['id' => $this->solution->id, 'title' => $this->solution->title, 'slug' => $this->solution->slug] : null,
            'location' => $this->whenLoaded('location', fn () => $this->location ? ['id' => $this->location->id, 'name' => $this->location->name] : null),
            'notes' => $this->notes,
            'preferred' => VisitText::preferredRows($this->resource),
            'scheduled_start_at' => $this->scheduled_start_at?->toIso8601String(),
            'scheduled_end_at' => $this->scheduled_end_at?->toIso8601String(),
            'visit_date' => VisitText::date($this->scheduled_start_at),
            'visit_time' => VisitText::time($this->resource),
            'assigned_to' => $this->assigned_to,
            'assignee_name' => $this->whenLoaded('assignee', fn () => $this->assignee?->name),
            'staff_note' => $this->staff_note,
            'cancel_reason' => $this->cancel_reason,
            'confirmed_at' => $this->confirmed_at?->toIso8601String(),
            'completed_at' => $this->completed_at?->toIso8601String(),
            'cancelled_at' => $this->cancelled_at?->toIso8601String(),
            'reminded_at' => $this->reminded_at?->toIso8601String(),
            'lead_id' => $this->lead_id,
            'source_url' => $this->source_url,
            'source_path' => $this->source_path,
            'source_title' => $this->source_title,
            'utm_source' => $this->utm_source,
            'utm_medium' => $this->utm_medium,
            'utm_campaign' => $this->utm_campaign,
            'admin_path' => $this->adminPath(),
            'events' => $this->whenLoaded('events', fn () => $this->events->map(fn ($e) => [
                'id' => $e->id,
                'type' => $e->type,
                'from' => $e->from_value,
                'to' => $e->to_value,
                'note' => $e->note,
                'actor_name' => $e->relationLoaded('user') ? $e->user?->name : null,
                'created_at' => $e->created_at?->toIso8601String(),
            ])->values()),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
