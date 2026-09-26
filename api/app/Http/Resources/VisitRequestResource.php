<?php

namespace App\Http\Resources;

use App\Enums\VisitStatus;
use App\Models\VisitRequest;
use App\Support\Visits\VisitText;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A visit request as its customer sees it — through the guest link or the
 * portal.
 *
 * What is absent is the point: no `staff_note`, no engineer, no lead, no
 * source, no token. The note is a judgement written for colleagues (the
 * rule `status_note` follows on a customer) and the token is handed out once,
 * on create, by name. `can_cancel` and `can_reschedule` are the API's answer
 * so the page draws only the buttons a POST will accept.
 *
 * @mixin VisitRequest
 */
class VisitRequestResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $status = $this->status;

        return [
            'reference' => $this->reference,
            'status' => $status->value,
            'status_label' => $status->label(),
            'topic' => $this->topic(),
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'company' => $this->company,
            'site_address' => $this->site_address,
            'notes' => $this->notes,
            'preferred' => VisitText::preferredRows($this->resource),
            'scheduled_start_at' => $this->scheduled_start_at?->toIso8601String(),
            'scheduled_end_at' => $this->scheduled_end_at?->toIso8601String(),
            'visit_date' => VisitText::date($this->scheduled_start_at),
            'visit_time' => VisitText::time($this->resource),
            'cancel_reason' => $status === VisitStatus::Cancelled ? $this->cancel_reason : null,
            'can_cancel' => $status->isOpen(),
            'can_reschedule' => $status->isOpen(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
