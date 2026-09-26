<?php

namespace App\Jobs;

use App\Enums\InboundMailProvider;
use App\Models\NewsletterImport;
use App\Models\Setting;
use App\Support\InboundMail\MailboxScanner;
use App\Support\Newsletter\CsvImporter;
use App\Support\Newsletter\HarvestState;
use App\Support\Newsletter\MailboxHarvester;
use App\Support\Newsletter\MailboxImport;
use App\Support\Newsletter\ScanCredentials;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * One slice of a mailbox scan, and the next one queued behind it.
 *
 * A mailbox can hold a hundred thousand messages, and the queue is drained
 * by `queue:work --stop-when-empty --max-time=50` once a minute with the
 * database queue's `retry_after` at ninety seconds — so a job that ran for
 * twenty minutes would be handed to a second worker after ninety and killed
 * by the first at the minute. This job does at most `BUDGET_SECONDS` of
 * work, persists where it got to (`HarvestState`), and dispatches itself
 * again; the chain ends when the harvester says it is done, or the row says
 * it was cancelled.
 *
 * Nothing thrown leaves `handle()` (the rule every queued job here keeps):
 * a refusal from the server becomes the row's `error`, in the server's
 * words, for the screen to show — and whichever way the scan stops, the
 * one-off credentials and the consent are forgotten, because the mailbox is
 * not needed once the addresses are collected.
 */
class ScanMailboxForSubscribers implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    /** Under the database queue's `retry_after` of 90, so no second worker can take a slice mid-way. */
    public int $timeout = 80;

    /** A slice ends here so the scheduler's `--max-time=50` never cuts one off. */
    public const BUDGET_SECONDS = 40;

    /** The columns the scan's CSV maps to, in `HarvestState::CSV_HEADERS` order. */
    public const MAPPING = ['email' => 0, 'first_name' => 1, 'last_name' => 2, 'company' => null, 'phone' => null];

    public function __construct(public readonly int $importId, public readonly string $credentialsKey) {}

    public function handle(): void
    {
        $import = NewsletterImport::find($this->importId);

        if ($import === null || ! in_array($import->status, ['pending', 'scanning'], true)) {
            // Discarded, or already done — the chain stops here.
            ScanCredentials::forget($this->credentialsKey);

            return;
        }

        $state = null;
        $connection = null;

        try {
            $connection = ScanCredentials::read($this->credentialsKey)
                ?? throw new \RuntimeException("This scan's credentials have expired. Start it again.");

            $scanner = app()->makeWith(MailboxScanner::class, ['connection' => self::resolve($connection)]);

            $import->update(['status' => 'scanning', 'error' => null]);
            $state = HarvestState::load($import);
            $progress = $import->progress ?? [];

            $outcome = (new MailboxHarvester)->run(
                $scanner,
                $state,
                MailboxImport::ownAddresses($scanner->account()),
                (bool) ($progress['include_junk'] ?? false),
                self::date($progress['since'] ?? null),
                self::date($progress['until'] ?? null),
                CarbonImmutable::now()->addSeconds(self::BUDGET_SECONDS),
            );

            $state->save($import);

            if ($outcome === MailboxHarvester::PAUSED) {
                self::dispatch($this->importId, $this->credentialsKey);

                return;
            }

            $path = $state->writeCsv($import);
            $analysis = CsvImporter::dryRun(
                Storage::disk(HarvestState::DISK)->path($path),
                self::MAPPING,
                ownDomains: MailboxImport::ownDomains($scanner->account()),
            ) + ['mapping' => self::MAPPING, 'capped' => $state->capped, 'account' => $scanner->account()];

            $import->update([
                'status' => 'ready',
                'file' => $path,
                'analysis' => $analysis,
                'total_rows' => count($state->addresses),
                'expires_at' => now()->addDay(),
            ]);
        } catch (Throwable $e) {
            /*
             * For a one-off IMAP source the row says one sentence, not the
             * socket's words. "Connection refused" against "timed out"
             * against a server's banner is a port scan read back through the
             * screen, and the person reading it is a campaign manager rather
             * than whoever runs the server. The words go to the log; a
             * consent source keeps the provider's, which name no host.
             */
            $imap = ($connection['source'] ?? null) === 'imap';

            $import->update(['status' => 'failed', 'error' => $imap
                ? 'The mailbox could not be read. Check the server name, the port, the username and the password, then start again.'
                : mb_substr($e->getMessage(), 0, 500)]);
            Log::warning('A mailbox scan for subscribers failed', ['import' => $this->importId, 'error' => $e->getMessage()]);
        } finally {
            if ($import->fresh()?->status !== 'scanning') {
                self::release($import, $this->credentialsKey);
            }
        }
    }

    /**
     * Let go of everything a finished scan held: the one-off credentials,
     * the scratch state, the consent.
     */
    public static function release(NewsletterImport $import, ?string $credentialsKey = null): void
    {
        if ($credentialsKey !== null) {
            ScanCredentials::forget($credentialsKey);
        }

        HarvestState::discard($import);
        MailboxImport::forgetConsent();
    }

    /**
     * The connection the scanner opens: the stored one-off IMAP details, or
     * for a consent source the fixed host with an access token minted for
     * this slice — a slice is well inside a token's hour, and the next slice
     * mints its own.
     *
     * @param  array<string, mixed>  $connection
     * @return array{host: string, port: int, encryption: string, username: string, password: string, authentication: ?string}
     */
    private static function resolve(array $connection): array
    {
        $provider = InboundMailProvider::tryFrom((string) ($connection['source'] ?? ''));

        if ($provider !== null && $provider->isOAuth()) {
            $oauth = MailboxImport::oauth($provider);
            $account = (string) Setting::get('newsletter_oauth_account');

            return [
                'host' => (string) $provider->imapHost(),
                'port' => $provider->imapPort(),
                'encryption' => 'ssl',
                'username' => $account,
                'password' => $oauth->accessToken(),
                'authentication' => 'oauth',
            ];
        }

        return [
            'host' => (string) ($connection['host'] ?? ''),
            'port' => (int) ($connection['port'] ?? 993),
            'encryption' => (string) ($connection['encryption'] ?? 'ssl'),
            'username' => (string) ($connection['username'] ?? ''),
            'password' => (string) ($connection['password'] ?? ''),
            'authentication' => null,
        ];
    }

    private static function date(mixed $value): ?CarbonImmutable
    {
        return is_string($value) && $value !== '' ? CarbonImmutable::parse($value) : null;
    }
}
