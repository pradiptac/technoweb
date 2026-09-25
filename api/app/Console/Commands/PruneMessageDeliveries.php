<?php

namespace App\Console\Commands;

use App\Models\MessageDelivery;
use Illuminate\Console\Command;

/**
 * Delivery rows older than ninety days go. A broadcast's `recipient_count`
 * stays on the broadcast, so an old one still says how many it reached.
 */
class PruneMessageDeliveries extends Command
{
    protected $signature = 'technoware:prune-message-deliveries {--days=90}';

    protected $description = 'Delete messaging delivery rows past their retention';

    public function handle(): int
    {
        $days = max(30, (int) $this->option('days'));
        $deleted = MessageDelivery::query()->where('created_at', '<', now()->subDays($days))->delete();

        $this->info("Deleted {$deleted} delivery rows older than {$days} days.");

        return self::SUCCESS;
    }
}
