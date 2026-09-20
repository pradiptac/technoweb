<?php

namespace App\Console\Commands;

use App\Models\WebhookDelivery;
use Illuminate\Console\Command;

/**
 * Deletes webhook deliveries older than thirty days.
 *
 * A delivery row is a payload — a whole order, a lead with a telephone
 * number — kept so a failed send can be read and resent. Thirty days is
 * longer than any retry schedule (the last attempt is about fourteen hours
 * after the first) and long enough for somebody to notice a hook went quiet;
 * past that the rows are a copy of personal data with no job left to do.
 *
 * Ranges on `created_at`: a delivery is about the moment its event happened,
 * and a redelivery is a new row with its own date. Deleted in chunks, because
 * a busy shop writes one row per hook per order and a single `DELETE` over a
 * month of them holds a lock for longer than the nightly window should.
 */
class PruneWebhookDeliveries extends Command
{
    public const DAYS = 30;

    protected $signature = 'technoware:prune-webhook-deliveries';

    protected $description = 'Delete webhook delivery records older than thirty days';

    public function handle(): int
    {
        $before = now()->subDays(self::DAYS);
        $deleted = 0;

        do {
            $batch = WebhookDelivery::query()
                ->where('created_at', '<', $before)
                ->orderBy('id')
                ->limit(1000)
                ->pluck('id');

            if ($batch->isEmpty()) {
                break;
            }

            $deleted += WebhookDelivery::query()->whereIn('id', $batch)->delete();
        } while ($batch->count() === 1000);

        $this->info("Deleted {$deleted} webhook deliver".($deleted === 1 ? 'y' : 'ies').' older than '.self::DAYS.' days.');

        return self::SUCCESS;
    }
}
