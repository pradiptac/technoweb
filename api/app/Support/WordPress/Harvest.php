<?php

namespace App\Support\WordPress;

use App\Models\WordPressImport;
use Generator;
use Illuminate\Support\Facades\Storage;

/**
 * What a scan has read from the site so far, and where it got to.
 *
 * Each collection is a JSON-lines file under `wordpress-imports/{id}/` on the
 * private disk — `posts.jsonl`, `products.jsonl` — one source record per
 * line, exactly as the REST API returned it. The review and the commit read
 * these files and never the site, which is why the commit needs no
 * credentials and why a dry run and the commit see the same data.
 *
 * `state.json` beside them is the scan's memory between queued slices (the
 * newsletter's `HarvestState` idea): the site's index and settings, the task
 * list with each task's page, and how many records each collection holds.
 * Written through a temporary file and a move, so a slice killed mid-write
 * leaves the previous state rather than half of one.
 */
final class Harvest
{
    public const DISK = 'local';

    /** @var array<string, mixed> name, url, root, namespaces, wc settings */
    public array $site = [];

    /**
     * @var list<array{key: string, route: string, query: array<string, scalar>, page: int, pages: ?int, done: bool, optional: bool, parent?: int|string}>
     */
    public array $tasks = [];

    /** @var array<string, int> records written per collection */
    public array $counts = [];

    /** @var array<string, int> the site's own total per collection, from X-WP-Total */
    public array $totals = [];

    /** @var array<string, string> optional endpoints the site did not answer, and why */
    public array $missing = [];

    public int $requests = 0;

    public static function dir(WordPressImport $import): string
    {
        return 'wordpress-imports/'.$import->id;
    }

    public static function load(WordPressImport $import): self
    {
        $harvest = new self;
        $path = self::dir($import).'/state.json';
        $disk = Storage::disk(self::DISK);

        if ($disk->exists($path) && is_array($state = json_decode((string) $disk->get($path), true))) {
            foreach (['site', 'tasks', 'counts', 'totals', 'missing'] as $key) {
                $harvest->{$key} = (array) ($state[$key] ?? []);
            }
            $harvest->requests = (int) ($state['requests'] ?? 0);
        }

        return $harvest;
    }

    public function save(WordPressImport $import): void
    {
        $disk = Storage::disk(self::DISK);
        $path = self::dir($import).'/state.json';

        $disk->put($path.'.tmp', (string) json_encode([
            'site' => $this->site,
            'tasks' => $this->tasks,
            'counts' => $this->counts,
            'totals' => $this->totals,
            'missing' => $this->missing,
            'requests' => $this->requests,
        ]));
        $disk->delete($path);
        $disk->move($path.'.tmp', $path);

        $import->update(['progress' => array_merge($import->progress ?? [], $this->progress())]);
    }

    /** @return array<string, mixed> what the screen shows while the scan runs */
    public function progress(): array
    {
        $done = count(array_filter($this->tasks, fn ($t) => $t['done']));
        $current = collect($this->tasks)->first(fn ($t) => ! $t['done']);

        return [
            'collections' => $this->counts,
            'totals' => $this->totals,
            'missing' => $this->missing,
            'tasks_done' => $done,
            'tasks_total' => count($this->tasks),
            'current' => $current['key'] ?? null,
            'requests' => $this->requests,
        ];
    }

    /** @param  list<array<string, mixed>>  $items */
    public function append(WordPressImport $import, string $collection, array $items): void
    {
        if ($items === []) {
            $this->counts[$collection] ??= 0;

            return;
        }

        $lines = '';
        foreach ($items as $item) {
            $lines .= json_encode($item, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)."\n";
        }

        $path = Storage::disk(self::DISK)->path(self::file($import, $collection));
        @mkdir(dirname($path), 0775, true);
        file_put_contents($path, $lines, FILE_APPEND | LOCK_EX);

        $this->counts[$collection] = ($this->counts[$collection] ?? 0) + count($items);
    }

    /**
     * Every record of a collection, in the order the site returned them.
     *
     * @return Generator<int, array<string, mixed>>
     */
    public static function read(WordPressImport $import, string $collection): Generator
    {
        $path = Storage::disk(self::DISK)->path(self::file($import, $collection));

        if (! is_file($path)) {
            return;
        }

        $handle = fopen($path, 'r');

        try {
            while (($line = fgets($handle)) !== false) {
                if (is_array($record = json_decode($line, true))) {
                    yield $record;
                }
            }
        } finally {
            fclose($handle);
        }
    }

    /** @return list<array<string, mixed>> a whole collection in memory — for the small ones only */
    public static function all(WordPressImport $import, string $collection): array
    {
        return iterator_to_array(self::read($import, $collection), false);
    }

    public static function discard(WordPressImport $import): void
    {
        Storage::disk(self::DISK)->deleteDirectory(self::dir($import));
    }

    private static function file(WordPressImport $import, string $collection): string
    {
        // A collection name is ours (`cpt:portfolio` → `cpt-portfolio`), never a path from the site.
        return self::dir($import).'/'.preg_replace('/[^a-z0-9_-]/', '-', strtolower($collection)).'.jsonl';
    }
}
