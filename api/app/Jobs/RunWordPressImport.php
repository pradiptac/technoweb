<?php

namespace App\Jobs;

use App\Models\WordPressImport;
use App\Support\Net\UnsafeUrl;
use App\Support\SealedCache;
use App\Support\WordPress\Client;
use App\Support\WordPress\Harvest;
use App\Support\WordPress\Importer;
use App\Support\WordPress\Scanner;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * One slice of a WordPress import — scanning the site, analysing what was
 * read, or committing it — and the next slice queued behind it.
 *
 * The newsletter mailbox scan's shape (`ScanMailboxForSubscribers`), for its
 * reasons: the queue is drained by `queue:work --max-time=50` once a minute
 * with `retry_after` at ninety seconds, so no job may run long. Each slice
 * works for `BUDGET_SECONDS`, writes down where it got to and dispatches the
 * next; the chain stops when the phase is done or the row says it was
 * cancelled.
 *
 *  - **scan** reads the site into the harvest. Only this phase holds the
 *    credentials, sealed in the cache under a key only the chain carries
 *    (`SealedCache`), and they are forgotten the moment it stops scanning.
 *  - **analyse** is the dry run; it ends with the import `ready` for review.
 *  - **commit** writes; it ends `completed`, and the harvest is deleted.
 *
 * Nothing thrown leaves `handle()`: a failure becomes the row's `error` for
 * the screen to show. A commit that fails keeps its cursor, so pressing
 * Resume carries on from the last checkpoint rather than starting again —
 * and every record it rewrites is an update through the map, never a copy.
 */
class RunWordPressImport implements ShouldQueue
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
        public readonly ?string $credentialsKey = null,
    ) {}

    public function handle(): void
    {
        $import = WordPressImport::find($this->importId);
        $expected = ['scan' => ['pending', 'scanning'], 'analyse' => ['analysing'], 'commit' => ['running']][$this->phase] ?? [];

        if ($import === null || ! in_array($import->status, $expected, true)) {
            $this->forgetCredentials();

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
            Log::warning('A WordPress import failed', ['import' => $this->importId, 'phase' => $this->phase, 'error' => $e->getMessage()]);
        } finally {
            if ($this->phase === 'scan' && $import->fresh()?->status !== 'scanning') {
                $this->forgetCredentials();
            }
        }
    }

    /** The worker killed the slice (it ran past its timeout): say so, keep the cursor. */
    public function failed(?Throwable $e = null): void
    {
        $import = WordPressImport::find($this->importId);

        if ($import !== null && in_array($import->status, ['pending', 'scanning', 'analysing', 'running'], true)) {
            $import->update([
                'status' => 'failed',
                'error' => $this->phase === 'commit'
                    ? 'A step took too long and was stopped. Press Resume to carry on from where it got to.'
                    : 'The scan took too long and was stopped. Start it again.',
            ]);
        }

        $this->forgetCredentials();
    }

    private function scan(WordPressImport $import, CarbonImmutable $deadline): void
    {
        $credentials = $this->credentialsKey === null ? null : SealedCache::read($this->credentialsKey);

        if ($credentials === null) {
            throw new \RuntimeException('The scan\'s credentials have expired. Start it again.');
        }

        $import->update(['status' => 'scanning', 'error' => null]);
        $harvest = Harvest::load($import);
        $outcome = (new Scanner)->run(Client::fromCredentials($credentials), $harvest, $import, $deadline);
        $harvest->save($import);

        if ($outcome === Scanner::PAUSED) {
            self::dispatch($this->importId, 'scan', $this->credentialsKey);

            return;
        }

        $progress = $import->progress ?? [];
        unset($progress['analyse']);

        $import->update([
            'status' => 'analysing',
            'progress' => $progress,
            'analysis' => ['site' => $harvest->site + [
                'harvest_counts' => $harvest->counts,
                'harvest_totals' => $harvest->totals,
                'missing' => $harvest->missing,
            ]],
        ]);

        self::dispatch($this->importId, 'analyse');
    }

    private function analyse(WordPressImport $import, CarbonImmutable $deadline): void
    {
        if ((new Importer)->analyse($import, $deadline) === Importer::PAUSED) {
            self::dispatch($this->importId, 'analyse');

            return;
        }

        $import->update([
            'status' => 'ready',
            'expires_at' => now()->addDays((int) config('wordpress_import.ready_days', 3)),
        ]);
    }

    private function commit(WordPressImport $import, CarbonImmutable $deadline): void
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

        Harvest::discard($import);
    }

    private function forgetCredentials(): void
    {
        if ($this->credentialsKey !== null) {
            SealedCache::forget($this->credentialsKey);
        }
    }

    /**
     * The row's error, in words for the person at the screen. A refusal from
     * the site or from `SafeHttp` is already a sentence; a connection failure
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
