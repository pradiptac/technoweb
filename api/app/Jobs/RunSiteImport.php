<?php

namespace App\Jobs;

use App\Models\SiteImport;
use App\Support\Net\UnsafeUrl;
use App\Support\SiteImport\Importer;
use App\Support\SiteImport\Scanner;
use App\Support\SiteImport\ScanState;
use App\Support\WordPress\Harvest;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * One slice of a site import — reading the site (or unpacking the ZIP),
 * analysing what was read, or committing it — and the next slice queued
 * behind it. `RunWordPressImport`'s state machine, for the same reasons: the
 * queue is drained by `queue:work --max-time=50` once a minute with
 * `retry_after` at ninety seconds, so no job may run long. Each slice works
 * for `BUDGET_SECONDS`, writes down where it got to and dispatches the next;
 * the chain stops when the phase is done or the row says it was cancelled.
 *
 * Nothing thrown leaves `handle()`: a failure becomes the row's `error` for
 * the screen to show. A commit that fails keeps its cursor, so Resume carries
 * on from the last checkpoint, and every record it rewrites is an update
 * through the map, never a copy.
 */
class RunSiteImport implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    /** Under the database queue's `retry_after` of 90. */
    public int $timeout = 80;

    /** A slice stops starting new work here; a download in flight may carry it past. */
    public const BUDGET_SECONDS = 35;

    public function __construct(
        public readonly int $importId,
        public readonly string $phase,
    ) {}

    public function handle(): void
    {
        $import = SiteImport::find($this->importId);
        $expected = ['scan' => ['pending', 'scanning'], 'analyse' => ['analysing'], 'commit' => ['running']][$this->phase] ?? [];

        if ($import === null || ! in_array($import->status, $expected, true)) {
            return;
        }

        $deadline = CarbonImmutable::now()->addSeconds(self::BUDGET_SECONDS);

        try {
            match ($this->phase) {
                'scan' => $this->scan($import, $deadline),
                'analyse' => $this->analyse($import, $deadline),
                'commit' => $this->commit($import, $deadline),
            };
        } catch (Throwable $e) {
            $import->update(['status' => 'failed', 'error' => self::sentence($e)]);
            Log::warning('A site import failed', ['import' => $this->importId, 'phase' => $this->phase, 'error' => $e->getMessage()]);
        }
    }

    /** The worker killed the slice (it ran past its timeout): say so, keep the cursor. */
    public function failed(?Throwable $e = null): void
    {
        $import = SiteImport::find($this->importId);

        if ($import !== null && in_array($import->status, ['pending', 'scanning', 'analysing', 'running'], true)) {
            $import->update([
                'status' => 'failed',
                'error' => $this->phase === 'commit'
                    ? 'A step took too long and was stopped. Press Resume to carry on from where it got to.'
                    : 'The scan took too long and was stopped. Start it again.',
            ]);
        }
    }

    private function scan(SiteImport $import, CarbonImmutable $deadline): void
    {
        $import->update(['status' => 'scanning', 'error' => null]);
        $state = ScanState::load($import);
        $outcome = (new Scanner)->run($import, $state, new Harvest, $deadline);
        $state->save($import);

        if ($outcome === Scanner::PAUSED) {
            self::dispatch($this->importId, 'scan');

            return;
        }

        $progress = $import->progress ?? [];
        unset($progress['analyse']);

        $import->update([
            'status' => 'analysing',
            'progress' => $progress,
            'analysis' => ['site' => $state->site],
        ]);

        self::dispatch($this->importId, 'analyse');
    }

    private function analyse(SiteImport $import, CarbonImmutable $deadline): void
    {
        if ((new Importer)->analyse($import, $deadline) === Importer::PAUSED) {
            self::dispatch($this->importId, 'analyse');

            return;
        }

        $import->update([
            'status' => 'ready',
            'expires_at' => now()->addDays((int) config('site_import.ready_days', 3)),
        ]);
    }

    private function commit(SiteImport $import, CarbonImmutable $deadline): void
    {
        if ((new Importer)->commit($import, $deadline) === Importer::PAUSED) {
            self::dispatch($this->importId, 'commit');

            return;
        }

        $result = Importer::result($import);

        $import->update([
            'status' => 'completed',
            'completed_at' => now(),
            'counts' => $result['steps'],
            'problems' => $result['notices'],
            'expires_at' => null,
        ]);

        self::discardFiles($import);
    }

    /** The harvest and the uploaded ZIP: both hold the whole site. */
    public static function discardFiles(SiteImport $import): void
    {
        Harvest::discard($import);

        if ($import->zip_path !== null) {
            Storage::disk(Harvest::DISK)->delete($import->zip_path);
        }
    }

    /**
     * The row's error, in words for the person at the screen. A refusal from
     * `SafeHttp` or the unpacker is already a sentence; a connection failure
     * is one fixed sentence rather than cURL's words, which name addresses.
     */
    private static function sentence(Throwable $e): string
    {
        return match (true) {
            $e instanceof ConnectionException => 'The site could not be reached. Check the address and that the site is up, then try again.',
            $e instanceof UnsafeUrl, $e instanceof \RuntimeException => mb_substr($e->getMessage(), 0, 500),
            default => 'Something went wrong while importing. The details are in the server log.',
        };
    }
}
