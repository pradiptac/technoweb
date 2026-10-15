<?php

namespace App\Console\Commands;

use App\Jobs\RunSiteImport;
use App\Models\SiteImport;
use App\Support\WordPress\Harvest;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * Tidies site imports nobody finished with.
 *
 * A scanned import waiting for review holds the whole site — every page's
 * markup, and the uploaded ZIP — as files on the private disk. Past
 * `expires_at` (`site_import.ready_days`, three days) it is marked `expired`
 * and its files deleted. An import stuck in a queued phase for two hours is
 * one whose job chain died and is marked `failed`: a commit keeps its cursor
 * and can be resumed; a scan has to be started again. A ZIP uploaded and
 * never started is removed after a day.
 */
class PruneSiteImports extends Command
{
    public const STUCK_HOURS = 2;

    protected $signature = 'technoware:prune-site-imports';

    protected $description = 'Expire site imports left unreviewed, fail imports whose job chain died, and remove stale uploads';

    public function handle(): int
    {
        $expired = 0;

        SiteImport::query()->where('status', 'ready')->where('expires_at', '<', now())
            ->each(function (SiteImport $import) use (&$expired) {
                RunSiteImport::discardFiles($import);
                $import->update(['status' => 'expired', 'expires_at' => null]);
                $expired++;
            });

        $stuck = 0;

        SiteImport::query()->inFlight()->where('updated_at', '<', now()->subHours(self::STUCK_HOURS))
            ->each(function (SiteImport $import) use (&$stuck) {
                $import->update(['status' => 'failed', 'error' => $import->status === 'running'
                    ? 'The import stopped without finishing — the queue worker was interrupted. Press Resume to carry on.'
                    : 'The scan stopped without finishing — the queue worker was interrupted. Start it again.']);
                $stuck++;
            });

        // Files of cancelled and expired imports are not kept either.
        SiteImport::query()->whereIn('status', ['cancelled', 'expired'])->where('updated_at', '<', now()->subDay())
            ->each(fn (SiteImport $import) => RunSiteImport::discardFiles($import));

        $disk = Storage::disk(Harvest::DISK);
        $uploads = 0;

        foreach ($disk->files('site-imports/uploads') as $file) {
            if ($disk->lastModified($file) < now()->subDay()->getTimestamp()) {
                $disk->delete($file);
                $uploads++;
            }
        }

        $this->info("Expired {$expired} import(s); marked {$stuck} stalled import(s) as failed; removed {$uploads} stale upload(s).");

        return self::SUCCESS;
    }
}
