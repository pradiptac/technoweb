<?php

namespace App\Http\Resources;

use App\Enums\MeetingStatus;
use App\Models\Meeting;
use App\Support\Meetings\MeetingSettings;
use App\Support\Meetings\MeetingText;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A meeting as its customer sees it — through the guest link or the portal
 * (docs/meetings.md, `docs/meetings-contract.md`).
 *
 * What is absent is the point: no `staff_note`, no lead, no source, no
 * Google internals, no token, and the host by name only. `can_cancel` and
 * `can_reschedule` are the API's answer — the cutoff and the reschedule cap
 * applied — so the page draws only the buttons a POST will accept. The Meet
 * link is shown only while the meeting is still on.
 *
 * @mixin Meeting
 */
class MeetingResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $status = $this->status;
        $scheduled = $status === MeetingStatus::Scheduled;
        $beforeCutoff = $scheduled
            && $this->starts_at->copy()->subHours(MeetingSettings::changeCutoffHours())->gt(now());
        $left = max(0, MeetingSettings::maxReschedules() - (int) $this->reschedule_count);

        return [
            'reference' => $this->reference,
            'status' => $status->value,
            'status_label' => $status->label(),
            'meeting_type' => $this->whenLoaded('meetingType', fn () => $this->meetingType ? [
                'name' => $this->meetingType->name,
                'slug' => $this->meetingType->slug,
                'minutes' => $this->meetingType->minutes,
            ] : null),
            'host_name' => $this->host_name,
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
            'meet_url' => $scheduled ? $this->meet_url : null,
            'cancel_reason' => $status === MeetingStatus::Cancelled ? $this->cancel_reason : null,
            'can_cancel' => $beforeCutoff,
            'can_reschedule' => $beforeCutoff && $left > 0,
            'reschedules_left' => $left,
            'change_cutoff_hours' => MeetingSettings::changeCutoffHours(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
