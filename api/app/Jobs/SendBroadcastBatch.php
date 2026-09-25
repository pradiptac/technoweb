<?php

namespace App\Jobs;

use App\Enums\MessageDeliveryStatus;
use App\Models\MessageBroadcast;
use App\Models\MessageDelivery;
use App\Support\Messaging\Broadcasts;
use App\Support\Messaging\ChannelSender;
use App\Support\Messaging\QuietHours;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * One batch of a broadcast — `SendCampaignBatch`'s shape: ids in the
 * payload, one attempt, the per-row `pending` guard, and a failure for one
 * contact recorded on its row rather than taking the batch down.
 *
 * A broadcast is promotional, so a batch that wakes outside the window puts
 * itself back until it opens rather than sending at midnight.
 */
class SendBroadcastBatch implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 80;

    /** @param  array<int, int>  $deliveryIds */
    public function __construct(
        public int $broadcastId,
        public array $deliveryIds,
    ) {}

    public function handle(): void
    {
        $broadcast = MessageBroadcast::find($this->broadcastId);

        if ($broadcast === null) {
            return;
        }

        if (! QuietHours::allows()) {
            dispatch(new self($this->broadcastId, $this->deliveryIds))->delay(QuietHours::nextOpening());

            return;
        }

        $deliveries = MessageDelivery::query()->with(['contact', 'template'])
            ->whereIn('id', $this->deliveryIds)
            ->where('status', MessageDeliveryStatus::Pending->value)
            ->get();

        foreach ($deliveries as $delivery) {
            ChannelSender::deliver($delivery);
        }

        Broadcasts::completeIfDone($broadcast);
    }
}
