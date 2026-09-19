<?php

namespace App\Console\Commands;

use App\Jobs\ScanMailboxForSubscribers;
use App\Models\NewsletterImport;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * Tidies mailbox scans nobody finished with.
 *
 * A scan that is `ready` holds a file of addresses on the private disk
 * until it is imported or discarded; past `expires_at` (a day) it is
 * marked `expired` and the file deleted, because a list of customer
 * addresses is not something to leave lying about. A scan stuck in
 * `pending` or `scanning` for two hours is one whose job chain died — a
 * worker killed, a server rebooted — and is marked `failed` so the screen
 * stops waiting for it, with its credentials and consent forgotten, which
 * is what the job's own `finally` would have done.
 */
class PruneNewsletterScans extends Command
{
    public const STUCK_HOURS = 2;

    protected $signature = 'technoware:prune-newsletter-scans';

    protected $description = 'Expire mailbox scan results past their day, and fail scans whose job chain died';

    public function handle(): int
    {
        $expired = 0;

        NewsletterImport::query()->mailbox()->where('status', 'ready')
            ->where('expires_at', '<', now())
            ->each(function (NewsletterImport $import) use (&$expired) {
                if (filled($import->file) && Storage::disk('local')->exists((string) $import->file)) {
                    Storage::disk('local')->delete((string) $import->file);
                }
                $import->update(['status' => 'expired', 'file' => null, 'expires_at' => null]);
                ScanMailboxForSubscribers::release($import);
                $expired++;
            });

        $stuck = 0;

        NewsletterImport::query()->mailbox()->inFlight()
            ->where('updated_at', '<', now()->subHours(self::STUCK_HOURS))
            ->each(function (NewsletterImport $import) use (&$stuck) {
                $import->update(['status' => 'failed', 'error' => 'The scan stopped without finishing — the queue worker was interrupted. Start it again.']);
                ScanMailboxForSubscribers::release($import);
                $stuck++;
            });

        $this->info("Expired {$expired} scan result(s); marked {$stuck} stalled scan(s) as failed.");

        return self::SUCCESS;
    }
}
