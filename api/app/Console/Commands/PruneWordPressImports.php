<?php

namespace App\Console\Commands;

use App\Models\WordPressImport;
use App\Support\WordPress\Harvest;
use Illuminate\Console\Command;

/**
 * Tidies WordPress imports nobody finished with.
 *
 * A scanned import waiting for review holds the whole site — customers'
 * addresses and orders included — as files on the private disk. Past
 * `expires_at` (`wordpress_import.ready_days`, three days) it is marked
 * `expired` and the harvest deleted. An import stuck in a queued phase for
 * two hours is one whose job chain died — a worker killed, a server
 * rebooted — and is marked `failed`: a commit keeps its cursor and can be
 * resumed; a scan has to be started again.
 */
class PruneWordPressImports extends Command
{
    public const STUCK_HOURS = 2;

    protected $signature = 'technoware:prune-wordpress-imports';

    protected $description = 'Expire WordPress imports left unreviewed, and fail imports whose job chain died';

    public function handle(): int
    {
        $expired = 0;

        WordPressImport::query()->where('status', 'ready')->where('expires_at', '<', now())
            ->each(function (WordPressImport $import) use (&$expired) {
                Harvest::discard($import);
                $import->update(['status' => 'expired', 'expires_at' => null]);
                $expired++;
            });

        $stuck = 0;

        WordPressImport::query()->inFlight()->where('updated_at', '<', now()->subHours(self::STUCK_HOURS))
            ->each(function (WordPressImport $import) use (&$stuck) {
                $import->update(['status' => 'failed', 'error' => $import->status === 'running'
                    ? 'The import stopped without finishing — the queue worker was interrupted. Press Resume to carry on.'
                    : 'The scan stopped without finishing — the queue worker was interrupted. Start it again.']);
                $stuck++;
            });

        // Harvests of cancelled and failed scans are not kept either.
        WordPressImport::query()->whereIn('status', ['cancelled', 'expired'])->where('updated_at', '<', now()->subDay())
            ->each(fn (WordPressImport $import) => Harvest::discard($import));

        $this->info("Expired {$expired} import(s); marked {$stuck} stalled import(s) as failed.");

        return self::SUCCESS;
    }
}
