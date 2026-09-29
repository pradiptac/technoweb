<?php

namespace App\Support\Newsletter;

use App\Models\NewsletterImport;
use Illuminate\Support\Facades\Storage;

/**
 * Where a website crawl has got to, between two slices of the job — the
 * `HarvestState` of a crawl. A scratch JSON file on the private disk,
 * written to a temporary name and moved over the old one, so a slice killed
 * half-way through a write leaves the previous state rather than half of one.
 *
 * It holds the frontier (first in, first out, so the crawl goes level by
 * level and a depth limit means what it says), what has been visited, each
 * host's robots rules and when it was last asked for a page, the business
 * sites found on a directory, and every address with what was said beside it.
 */
final class CrawlState
{
    public const DISK = 'local';

    /** @var list<array{url: string, depth: int, kind: string, site: ?string}> kind: `start` or `linked` */
    public array $frontier = [];

    /** @var array<string, true> sha1(url) of every page fetched or refused */
    public array $visited = [];

    /** @var array<string, list<array{allow: bool, path: string}>> host => rules */
    public array $robots = [];

    /** @var array<string, float> host => microtime of the last request */
    public array $lastFetch = [];

    /** @var array<string, int> linked site host => pages opened */
    public array $sites = [];

    /**
     * @var array<string, array{names: array<string, int>, company: ?string, website: ?string, source_url: string, count: int}>
     */
    public array $found = [];

    /** @var list<string> Hunter domains already asked */
    public array $hunted = [];

    public int $pages = 0;

    public int $linkedPages = 0;

    public int $refused = 0;

    /** `crawl`, then `hunter`, then `done`. */
    public string $phase = 'crawl';

    public ?int $hunterLeft = null;

    public bool $capped = false;

    /** @var list<string> */
    public array $notes = [];

    public ?string $current = null;

    public ?string $startedAt = null;

    public static function path(NewsletterImport $import): string
    {
        return "newsletter-imports/crawl-{$import->id}.state.json";
    }

    public static function load(NewsletterImport $import): self
    {
        $state = new self;
        $disk = Storage::disk(self::DISK);
        $data = $disk->exists(self::path($import)) ? json_decode((string) $disk->get(self::path($import)), true) : null;

        if (! is_array($data)) {
            $state->startedAt = now()->toIso8601String();

            return $state;
        }

        foreach (['frontier', 'visited', 'robots', 'lastFetch', 'sites', 'found', 'hunted', 'notes'] as $key) {
            $state->{$key} = (array) ($data[$key] ?? []);
        }

        $state->pages = (int) ($data['pages'] ?? 0);
        $state->linkedPages = (int) ($data['linkedPages'] ?? 0);
        $state->refused = (int) ($data['refused'] ?? 0);
        $state->phase = (string) ($data['phase'] ?? 'crawl');
        $state->hunterLeft = isset($data['hunterLeft']) ? (int) $data['hunterLeft'] : null;
        $state->capped = (bool) ($data['capped'] ?? false);
        $state->current = $data['current'] ?? null;
        $state->startedAt = $data['startedAt'] ?? now()->toIso8601String();

        return $state;
    }

    /** Persist the scratch file, then the row's `progress`. */
    public function save(NewsletterImport $import): void
    {
        $disk = Storage::disk(self::DISK);
        $path = self::path($import);

        $disk->put($path.'.tmp', json_encode(get_object_vars($this), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

        if ($disk->exists($path)) {
            $disk->delete($path);
        }

        $disk->move($path.'.tmp', $path);
        $import->update(['progress' => $this->progress($import)]);
    }

    public static function discard(NewsletterImport $import): void
    {
        $disk = Storage::disk(self::DISK);

        foreach ([self::path($import), self::path($import).'.tmp'] as $path) {
            if ($disk->exists($path)) {
                $disk->delete($path);
            }
        }
    }

    /**
     * What the screen shows while the crawl runs, merged over the run's own
     * settings, which ride in the same column from the start.
     *
     * @return array<string, mixed>
     */
    public function progress(NewsletterImport $import): array
    {
        return array_merge($import->progress ?? [], [
            'phase' => $this->phase,
            'pages' => $this->pages,
            'linked_pages' => $this->linkedPages,
            'queued' => count($this->frontier),
            'sites' => count($this->sites),
            'addresses' => count($this->found),
            'hunter_used' => count($this->hunted),
            'refused' => $this->refused,
            'current' => $this->current,
            'capped' => $this->capped,
            'notes' => array_slice($this->notes, -5),
            'started_at' => $this->startedAt,
            'updated_at' => now()->toIso8601String(),
        ]);
    }

    /**
     * Add what one page (or Hunter) said about an address. The first company
     * and website stick — the page an address was first found on is the one
     * most likely to be its own — and names are counted, so the name seen
     * most often wins.
     */
    public function add(string $email, ?string $name, ?string $company, ?string $website, string $sourceUrl): void
    {
        $entry = $this->found[$email] ?? ['names' => [], 'company' => null, 'website' => null, 'source_url' => $sourceUrl, 'count' => 0];

        if (filled($name)) {
            $entry['names'][$name] = ($entry['names'][$name] ?? 0) + 1;
        }

        $entry['company'] ??= filled($company) ? mb_substr((string) $company, 0, 190) : null;
        $entry['website'] ??= $website;
        $entry['count']++;
        $this->found[$email] = $entry;
    }

    public const CSV_HEADERS = ['email', 'first_name', 'last_name', 'company', 'website', 'source_url', 'domain', 'seen'];

    /** The result as the import pipeline reads it: one row per address, the most-seen first. */
    public function writeCsv(NewsletterImport $import): string
    {
        $path = "newsletter-imports/crawl-{$import->id}.csv";
        Storage::disk(self::DISK)->makeDirectory('newsletter-imports');
        $handle = fopen(Storage::disk(self::DISK)->path($path), 'w');

        if ($handle === false) {
            throw new \RuntimeException('The crawl result could not be written to disk.');
        }

        try {
            Csv::write($handle, self::CSV_HEADERS, $this->rows(), escape: false);
        } finally {
            fclose($handle);
        }

        return $path;
    }

    /** @return iterable<array<int, string|null>> */
    private function rows(): iterable
    {
        $found = $this->found;
        uasort($found, fn (array $a, array $b) => $b['count'] <=> $a['count']);

        foreach ($found as $email => $info) {
            [$first, $last] = AddressKinds::nameSplit(HarvestState::bestName($info['names']), (string) $email);

            yield [
                (string) $email,
                $first,
                $last,
                $info['company'],
                $info['website'],
                mb_substr($info['source_url'], 0, 500),
                AddressKinds::domain((string) $email),
                (string) $info['count'],
            ];
        }
    }
}
