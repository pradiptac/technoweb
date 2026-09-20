<?php

namespace App\Http\Resources\Admin;

use App\Models\WebhookDelivery;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One delivery, for the log on the edit screen.
 *
 * The payload travels only when `withPayload()` was called — the detail read
 * of one delivery. A list of fifty deliveries each carrying a whole order is
 * a list nobody asked for, and a payload is what a person opens one row to
 * read.
 */
/** @mixin WebhookDelivery */
class WebhookDeliveryResource extends JsonResource
{
    private bool $includePayload = false;

    public function withPayload(): static
    {
        $this->includePayload = true;

        return $this;
    }

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'webhook_id' => $this->webhook_id,
            'event' => $this->event,
            'event_label' => $this->event()?->label() ?? $this->event,
            'status' => $this->status,
            'attempts' => (int) $this->attempts,
            'response_status' => $this->response_status,
            'response_excerpt' => $this->response_excerpt,
            'next_attempt_at' => $this->next_attempt_at?->toIso8601String(),
            'delivered_at' => $this->delivered_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            'payload' => $this->when($this->includePayload, fn () => $this->resource->payload),
        ];
    }
}
