<?php

namespace App\Http\Resources\Admin;

use App\Models\NewsletterSequenceEnrolment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin NewsletterSequenceEnrolment */
class NewsletterSequenceEnrolmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'subscriber' => $this->whenLoaded('subscriber', fn () => $this->subscriber === null ? null : [
                'id' => $this->subscriber->id,
                'email' => $this->subscriber->email,
                'name' => $this->subscriber->name(),
                'status' => $this->subscriber->status->value,
            ]),
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'next_position' => $this->next_position,
            'next_at' => $this->next_at?->toIso8601String(),
            'enrolled_at' => $this->enrolled_at->toIso8601String(),
            'completed_at' => $this->completed_at?->toIso8601String(),
            'cancelled_reason' => $this->cancelled_reason,
        ];
    }
}
