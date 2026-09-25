<?php

namespace App\Jobs;

use App\Models\MessageDelivery;
use App\Support\Messaging\ChannelSender;
use App\Support\Messaging\QuietHours;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * One event message on one channel, sent by the worker.
 *
 * The id rather than the model, so a delivery deleted in between is a
 * no-op rather than a throw. One attempt: a retry after the provider has
 * accepted a message but before the row said so would send it twice, and
 * `ChannelSender` records every failure on the row for the console.
 */
class SendChannelMessage implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 60;

    public function __construct(public int $deliveryId) {}

    public function handle(): void
    {
        $delivery = MessageDelivery::find($this->deliveryId);

        if ($delivery === null) {
            return;
        }

        // A promotional message that fell due outside the window — queued at
        // 8:59pm and reached at 9:01 — waits for the next opening.
        if (ChannelSender::deliver($delivery) === ChannelSender::LATER) {
            dispatch(new self($delivery->id))->delay(QuietHours::nextOpening());
        }
    }
}
