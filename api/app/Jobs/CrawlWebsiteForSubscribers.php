<?php

namespace App\Jobs;

use App\Models\NewsletterImport;
use App\Support\Newsletter\CrawlState;
use App\Support\Newsletter\CsvImporter;
use App\Support\Newsletter\MailboxImport;
use App\Support\Newsletter\WebsiteCrawler;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * One slice of a website crawl, and the next one queued behind it — the
 * mailbox scan's shape (`ScanMailboxForSubscribers`) for its reasons: the
 * queue is drained once a minute with `retry_after` at ninety seconds, so a
 * slice works for `BUDGET_SECONDS`, writes down where it got to
 * (`CrawlState`) and dispatches the next. The chain stops when the crawl is
 * done or the row says it was cancelled.
 *
 * When it is done the result is a CSV the import pipeline already knows how
 * to read, and the row is `ready` with `CsvImporter::dryRun()`'s analysis —
 * the review screen is the mailbox scan's. Nothing thrown leaves `handle()`:
 * a failure is the row's `error`.
 */
class CrawlWebsiteForSubscribers implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 80;

    public const BUDGET_SECONDS = 40;

    /** The columns the crawl's CSV maps to, in `CrawlState::CSV_HEADERS` order. */
    public const MAPPING = [
        'email' => 0, 'first_name' => 1, 'last_name' => 2, 'company' => 3, 'phone' => null,
        'website' => 4, 'source_url' => 5,
    ];

    public function __construct(public readonly int $importId) {}

    public function handle(): void
    {
        $import = NewsletterImport::find($this->importId);

        if ($import === null || ! $import->isCrawl() || ! in_array($import->status, ['pending', 'scanning'], true)) {
            return;
        }

        try {
            // Conditional, so a cancel that lands between the check above and here is not overwritten.
            if (NewsletterImport::whereKey($import->id)->whereIn('status', ['pending', 'scanning'])->update(['status' => 'scanning', 'error' => null]) === 0) {
                return;
            }

            $import->refresh();
            $state = CrawlState::load($import);
            $own = MailboxImport::ownDomains();

            $outcome = (new WebsiteCrawler)->run($state, $import->progress ?? [], $own, CarbonImmutable::now()->addSeconds(self::BUDGET_SECONDS));
            $state->save($import);

            // Cancelled while this slice ran: stop, and let `destroy()` have tidied.
            if ($import->fresh()?->status !== 'scanning') {
                self::release($import);

                return;
            }

            if ($outcome === WebsiteCrawler::PAUSED) {
                self::dispatch($this->importId);

                return;
            }

            $path = $state->writeCsv($import);
            $analysis = CsvImporter::dryRun(Storage::disk(CrawlState::DISK)->path($path), self::MAPPING, ownDomains: $own) + [
                'mapping' => self::MAPPING,
                'capped' => $state->capped,
                'pages' => $state->pages,
                'linked_pages' => $state->linkedPages,
                'sites' => count($state->sites),
                'hunter_used' => count($state->hunted),
                'notes' => array_slice($state->notes, -10),
                'industry' => ($import->progress ?? [])['industry'] ?? null,
                'location' => ($import->progress ?? [])['location'] ?? null,
            ];

            $import->update([
                'status' => 'ready',
                'file' => $path,
                'analysis' => $analysis,
                'total_rows' => count($state->found),
                'expires_at' => now()->addDay(),
            ]);

            CrawlState::discard($import);
        } catch (Throwable $e) {
            $import->update(['status' => 'failed', 'error' => mb_substr($e->getMessage(), 0, 500)]);
            Log::warning('A website crawl for subscribers failed', ['import' => $this->importId, 'error' => $e->getMessage()]);
            self::release($import);
        }
    }

    /** The worker killed the slice: say so, and let go of the scratch state. */
    public function failed(?Throwable $e = null): void
    {
        $import = NewsletterImport::find($this->importId);

        if ($import !== null && in_array($import->status, ['pending', 'scanning'], true)) {
            $import->update(['status' => 'failed', 'error' => 'A step of the crawl took too long and was stopped. Start it again, perhaps with fewer pages.']);
            self::release($import);
        }
    }

    /** Everything a stopped crawl held: its scratch state. There is no credential and no consent to forget. */
    public static function release(NewsletterImport $import): void
    {
        CrawlState::discard($import);
    }
}
