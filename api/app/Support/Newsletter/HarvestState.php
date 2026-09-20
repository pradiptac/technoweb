<?php

namespace App\Support\Newsletter;

use App\Models\NewsletterImport;
use Illuminate\Support\Facades\Storage;

/**
 * Everything a mailbox scan has found so far, between one slice and the next.
 *
 * A scan runs as many short queued jobs (see `ScanMailboxForSubscribers`),
 * so what it knows has to outlive a job: the folders it listed and how each
 * was classified, where it is up to (`cursor`), the Message-IDs it has seen
 * (a Gmail label puts one message in several folders, and one message must
 * count once), and the addresses with their names and counts.
 *
 * It is a JSON file on the private disk beside the import's CSV, never a
 * column: it grows to tens of thousands of addresses, it is rewritten every
 * slice, and it is thrown away the moment the scan ends. Written to a
 * temporary name and renamed, so a slice that dies mid-write leaves the
 * previous state intact rather than half a file.
 */
final class HarvestState
{
    public const DISK = 'local';

    /** @var list<array{path: string, name: string, messages: int, skip: ?string, sent: bool}> */
    public array $folders = [];

    /** @var array{index: int, after_uid: int} */
    public array $cursor = ['index' => 0, 'after_uid' => 0];

    /** @var array<string, int> sha1(Message-ID), truncated */
    public array $seen = [];

    /**
     * @var array<string, array{names: array<string, int>, count: int, sent: int, first: ?string, last: ?string, folders: array<string, int>}>
     */
    public array $addresses = [];

    public int $messages = 0;

    public bool $capped = false;

    public ?string $startedAt = null;

    public static function path(NewsletterImport $import): string
    {
        return "newsletter-imports/scan-{$import->id}.state.json";
    }

    public static function load(NewsletterImport $import): self
    {
        $state = new self;
        $disk = Storage::disk(self::DISK);
        $path = self::path($import);

        if (! $disk->exists($path)) {
            $state->startedAt = now()->toIso8601String();

            return $state;
        }

        $data = json_decode((string) $disk->get($path), true);

        if (! is_array($data)) {
            $state->startedAt = now()->toIso8601String();

            return $state;
        }

        $state->folders = $data['folders'] ?? [];
        $state->cursor = $data['cursor'] ?? ['index' => 0, 'after_uid' => 0];
        $state->seen = $data['seen'] ?? [];
        $state->addresses = $data['addresses'] ?? [];
        $state->messages = (int) ($data['messages'] ?? 0);
        $state->capped = (bool) ($data['capped'] ?? false);
        $state->startedAt = $data['started_at'] ?? now()->toIso8601String();

        return $state;
    }

    /** Persist the scratch file and the row's `progress` column, in that order. */
    public function save(NewsletterImport $import): void
    {
        $disk = Storage::disk(self::DISK);
        $path = self::path($import);
        $tmp = $path.'.tmp';

        $disk->put($tmp, json_encode([
            'folders' => $this->folders,
            'cursor' => $this->cursor,
            'seen' => $this->seen,
            'addresses' => $this->addresses,
            'messages' => $this->messages,
            'capped' => $this->capped,
            'started_at' => $this->startedAt,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

        if ($disk->exists($path)) {
            $disk->delete($path);
        }
        $disk->move($tmp, $path);

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
     * What the screen shows while the scan runs. The scan's own settings
     * (`since`, `until`, `include_junk`) ride in the same column from the
     * start, so they are kept.
     *
     * @return array<string, mixed>
     */
    public function progress(NewsletterImport $import): array
    {
        $included = array_values(array_filter($this->folders, fn (array $f) => $f['skip'] === null));
        $current = $this->folders[$this->cursor['index']] ?? null;
        $known = array_filter(array_column($included, 'messages'), fn (int $n) => $n >= 0);

        return array_merge($import->progress ?? [], [
            'folders_total' => count($included),
            'folders_done' => count(array_filter($included, fn (array $f) => $this->isDone($f))),
            'folder' => $current !== null && $current['skip'] === null ? $current['name'] : null,
            'messages' => $this->messages,
            'messages_total' => count($known) === count($included) ? array_sum($known) : null,
            'addresses' => count($this->addresses),
            'skipped' => array_values(array_filter($this->folders, fn (array $f) => $f['skip'] !== null)),
            'capped' => $this->capped,
            'started_at' => $this->startedAt,
            'updated_at' => now()->toIso8601String(),
        ]);
    }

    /** @return list<string> */
    public const CSV_HEADERS = [
        'email', 'first_name', 'last_name', 'display_name', 'domain', 'occurrences', 'sent_to', 'first_seen', 'last_seen', 'folders',
    ];

    /**
     * The result as the import pipeline reads it — one row per address,
     * the most-used display name split into first and last, and the
     * diagnostics beside them for the reviewer.
     */
    public function writeCsv(NewsletterImport $import): string
    {
        $path = "newsletter-imports/mailbox-{$import->id}.csv";
        $absolute = Storage::disk(self::DISK)->path($path);

        Storage::disk(self::DISK)->makeDirectory('newsletter-imports');
        $handle = fopen($absolute, 'w');

        if ($handle === false) {
            throw new \RuntimeException('The scan result could not be written to disk.');
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
        $addresses = $this->addresses;
        // Most written-to first, so the preview shows the addresses that matter.
        uasort($addresses, fn (array $a, array $b) => [$b['count'], $a['first'] ?? ''] <=> [$a['count'], $b['first'] ?? '']);

        foreach ($addresses as $email => $info) {
            $display = self::bestName($info['names']);
            [$first, $last] = AddressKinds::nameSplit($display, (string) $email);

            yield [
                (string) $email,
                $first,
                $last,
                $display,
                AddressKinds::domain((string) $email),
                (string) $info['count'],
                (string) $info['sent'],
                $info['first'],
                $info['last'],
                implode('; ', array_keys($info['folders'])),
            ];
        }
    }

    /**
     * The display name an address was seen with most often. Ties go to the
     * longer one — "Priya Nair" over "Priya" — since a fuller name is the
     * one somebody typed deliberately.
     *
     * @param  array<string, int>  $names
     */
    public static function bestName(array $names): ?string
    {
        if ($names === []) {
            return null;
        }

        uksort($names, fn (string $a, string $b) => [$names[$b], mb_strlen($b)] <=> [$names[$a], mb_strlen($a)]);

        return (string) array_key_first($names);
    }

    /** @param  array{path: string}  $folder */
    private function isDone(array $folder): bool
    {
        foreach ($this->folders as $i => $f) {
            if ($f['path'] === $folder['path']) {
                return $i < $this->cursor['index'];
            }
        }

        return false;
    }
}
