<?php

namespace App\Http\Resources\Admin;

use App\Enums\BroadcastStatus;
use App\Models\MessageBroadcast;
use App\Support\Messaging\Broadcasts;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin MessageBroadcast */
class MessageBroadcastResource extends JsonResource
{
    private bool $detail = false;

    public function detail(): self
    {
        $this->detail = true;

        return $this;
    }

    public function toArray(Request $request): array
    {
        $draft = in_array($this->status, [BroadcastStatus::Draft, BroadcastStatus::Scheduled], true);

        return [
            'id' => $this->id,
            'name' => $this->name,
            'channel' => $this->channel->value,
            'channel_label' => $this->channel->label(),
            'message_template_id' => $this->message_template_id,
            'template' => $this->whenLoaded('template', fn () => $this->template === null ? null : [
                'id' => $this->template->id,
                'name' => $this->template->name,
                'approval_status' => $this->template->approval_status->value,
                'sendable' => $this->template->sendable(),
            ]),
            'audience' => $this->audience->value,
            'audience_label' => $this->audience->label(),
            'newsletter_group_id' => $this->newsletter_group_id,
            'store_product_id' => $this->store_product_id,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'scheduled_at' => $this->scheduled_at?->toIso8601String(),
            'started_at' => $this->started_at?->toIso8601String(),
            'completed_at' => $this->completed_at?->toIso8601String(),
            'recipient_count' => $this->recipient_count,
            'created_at' => $this->created_at?->toIso8601String(),
            // Live while nobody has been frozen into it; the frozen count after.
            'audience_count' => $this->when($this->detail && $draft, fn () => Broadcasts::audienceFor($this->resource)->count()),
            'report' => $this->when($this->detail && ! $draft, fn () => Broadcasts::report($this->resource)),
        ];
    }
}
