<?php

namespace App\Support\SiteImport;

use App\Models\SiteImport;
use App\Support\WordPress\Harvest;
use Illuminate\Support\Facades\Storage;

/**
 * The scan's memory between queued slices (the newsletter crawl's
 * `CrawlState` idea, for a site import): where the crawl or the unzip got to,
 * the frontier, what robots.txt said, the chrome tally. `state.json` in the
 * import's harvest folder, written through a temporary file and a move so a
 * slice killed mid-write leaves the previous state.
 */
final class ScanState
{
    /** crawl | zip | chrome | done */
    public string $phase = 'crawl';

    /** @var list<array{url: string, depth: int}> */
    public array $frontier = [];

    /** @var array<string, true> */
    public array $visited = [];

    /** @var array<string, list<array{allow: bool, path: string}>> */
    public array $robots = [];

    /** @var array<string, float> */
    public array $lastFetch = [];

    public int $pages = 0;

    public int $requests = 0;

    public bool $capped = false;

    public ?string $current = null;

    /** @var array<string, array{count: int, examples: list<string>}> why something was not brought in */
    public array $skipped = [];

    /** @var list<string> */
    public array $notes = [];

    /** @var array<string, mixed> the unzip's cursor: index, files, bytes, prefix */
    public array $zip = [];

    /** @var array<string, mixed> the chrome tally: offset, counts */
    public array $chrome = ['offset' => 0, 'counts' => []];

    /** @var array<string, mixed> what the scan worked out about the site: name, home, menus, chrome signatures */
    public array $site = [];

    public static function load(SiteImport $import): self
    {
        $state = new self;
        $path = Harvest::dir($import).'/state.json';
        $disk = Storage::disk(Harvest::DISK);

        if ($disk->exists($path) && is_array($data = json_decode((string) $disk->get($path), true))) {
            foreach (get_object_vars($state) as $key => $default) {
                if (array_key_exists($key, $data)) {
                    $state->{$key} = $data[$key];
                }
            }
        }

        return $state;
    }

    public function save(SiteImport $import): void
    {
        $disk = Storage::disk(Harvest::DISK);
        $path = Harvest::dir($import).'/state.json';

        $disk->put($path.'.tmp', (string) json_encode(get_object_vars($this), JSON_INVALID_UTF8_SUBSTITUTE));
        $disk->delete($path);
        $disk->move($path.'.tmp', $path);

        $import->update(['progress' => array_merge($import->progress ?? [], $this->progress())]);
    }

    /** Why a page or file was left out — counted, with a few names. */
    public function skip(string $reason, string $label): void
    {
        $entry = $this->skipped[$reason] ?? ['count' => 0, 'examples' => []];
        $entry['count']++;

        if (count($entry['examples']) < 5) {
            $entry['examples'][] = mb_substr($label, 0, 120);
        }

        $this->skipped[$reason] = $entry;
    }

    /** @return array<string, mixed> what the screen shows while the scan runs */
    public function progress(): array
    {
        return [
            'phase' => $this->phase,
            'pages' => $this->pages,
            'queued' => count($this->frontier),
            'requests' => $this->requests,
            'current' => $this->current,
            'capped' => $this->capped,
            'zip_files' => (int) ($this->zip['files'] ?? 0),
        ];
    }
}
