<?php

namespace App\Console\Commands;

use App\Enums\BroadcastStatus;
use App\Models\MessageBroadcast;
use App\Support\Messaging\Broadcasts;
use Illuminate\Console\Command;

/**
 * Hand any scheduled broadcast whose time has come to the queue — the
 * campaigns' command, for the same open-ended-backwards reason: a
 * broadcast due while the scheduler was down goes late rather than never.
 */
class SendBroadcasts extends Command
{
    protected $signature = 'technoware:send-broadcasts';

    protected $description = 'Queue messaging broadcasts whose scheduled time has passed';

    public function handle(): int
    {
        $due = MessageBroadcast::query()->where('status', BroadcastStatus::Scheduled->value)
            ->whereNotNull('scheduled_at')->where('scheduled_at', '<=', now())->get();

        foreach ($due as $broadcast) {
            $count = Broadcasts::queue($broadcast);
            $this->line($count === null
                ? "Skipped \"{$broadcast->name}\": already claimed."
                : "Queued \"{$broadcast->name}\" to {$count} contacts.");
        }

        return self::SUCCESS;
    }
}
