<?php

namespace App\Http\Resources\Admin;

use App\Enums\MeetingStatus;
use App\Models\Meeting;
use App\Support\Meetings\MeetingText;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A meeting as the desk works it (docs/meetings.md, `docs/meetings-contract.md`).
 *
 * `date_label`, `time_label` and `timezone` are written here, in the app's
 * timezone, because the console's date helpers have none and a server in UTC
 * would draw 04:30 for a 10:00 meeting. `allowed_next` rides on every row,
 * the `VisitRequestResource` rule. `trail` only when the events are loaded —
 * the detail read. The access token is absent, as from every resource.
 *
 * Load `meetingType` and `host` before serialising a list (`preventLazyLoading`).
 *
 * @mixin Meeting
 */
class MeetingResource extends JsonResource
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
            'needs_outcome' => $status === MeetingStatus::Scheduled && $this->ends_at->lte(now()),
            'allowed_next' => $status->allowedNext(),
            'meeting_type' => $this->whenLoaded('meetingType', fn () => $this->meetingType ? [
                'id' => $this->meetingType->id,
                'name' => $this->meetingType->name,
                'slug' => $this->meetingType->slug,
                'minutes' => $this->meetingType->minutes,
            ] : null),
            'meeting_type_id' => $this->meeting_type_id,
            'host_id' => $this->host_id,
            'host_name' => $this->host_name,
            'host' => $this->whenLoaded('host', fn () => $this->host ? [
                'id' => $this->host->id,
                'name' => $this->host->name,
                'email' => $this->host->email,
            ] : null),
            'customer_id' => $this->customer_id,
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'company' => $this->company,
            'agenda' => $this->agenda,
            'starts_at' => $this->starts_at->toIso8601String(),
            'ends_at' => $this->ends_at->toIso8601String(),
            'date_label' => MeetingText::date($this->starts_at),
            'time_label' => MeetingText::time($this->resource),
            'timezone' => MeetingText::timezone(),
            'minutes' => (int) $this->starts_at->diffInMinutes($this->ends_at, true),
            'blocked_from' => $this->blocked_from->toIso8601String(),
            'blocked_until' => $this->blocked_until->toIso8601String(),
            'source' => $this->source->value,
            'source_label' => $this->source->label(),
            'created_by' => $this->created_by,
            'reschedule_count' => $this->reschedule_count,
            'cancel_reason' => $this->cancel_reason,
            'cancelled_at' => $this->cancelled_at?->toIso8601String(),
            'completed_at' => $this->completed_at?->toIso8601String(),
            'staff_note' => $this->staff_note,
            'lead_id' => $this->lead_id,
            'meet_url' => $this->meet_url,
            'google' => [
                'status' => $this->google_status->value,
                'status_label' => $this->google_status->label(),
                'event_id' => $this->google_event_id,
                'account' => $this->google_account,
                'attempts' => $this->google_attempts,
                'error' => $this->google_error,
            ],
            'source_url' => $this->source_url,
            'source_path' => $this->source_path,
            'source_title' => $this->source_title,
            'utm_source' => $this->utm_source,
            'utm_medium' => $this->utm_medium,
            'utm_campaign' => $this->utm_campaign,
            'admin_path' => $this->adminPath(),
            'trail' => $this->whenLoaded('events', fn () => $this->events->map(fn ($e) => [
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
