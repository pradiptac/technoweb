<?php

namespace App\Support\Tenders;

use App\Models\Media;
use App\Models\Tender;
use App\Support\MediaUrl;
use Illuminate\Support\Collection;

/**
 * A tender's documents — the notice, the bill of quantities, a corrigendum —
 * resolved from the media-library paths the row stores into something a page
 * can draw.
 *
 * **They are library paths, not private uploads, and that is a decision
 * rather than the easy way.** A tender document is public by nature: the
 * whole purpose of publishing a notice is that anybody may bid on it, so
 * there is nothing to restrict and no question of who is reading. That buys
 * the module out of the downloads centre's whole machine — `source`,
 * `private_path`, `DownloadFiles`, a streaming route, a throttle and a
 * proxy on the website, about six hundred lines — none of which would be
 * protecting anything here.
 *
 * **What it costs if that ever changes:** a tender document that must be
 * restricted, or must not have a guessable address, cannot be one of these.
 * It would mean moving them to `Download` rows, with a migration. The time
 * to decide that is before the first tender is published, not after.
 *
 * A document whose media row has gone is **dropped**, never rendered: a
 * bidder given a button that 404s has been told a document exists when it
 * does not. The same rule the page builder's downloads section follows.
 *
 * **Every read goes through the per-request memo, and `prime()` fills it for
 * a whole page in one query.** Without that, `documents_count` on an index
 * row is a `Media` query per tender — twenty on a page of twenty, two
 * hundred if a listing ever drew more. `DownloadFiles::prime()` exists for
 * exactly this, and this is the same arrangement: the resource is where the
 * N+1 would be, so the controller primes before it renders.
 */
final class TenderDocuments
{
    private const MEMO = 'tenders.media';

    /**
     * Load every document's media row for a page of tenders, in one query.
     *
     * Called by the controller before the resource renders. Paths already in
     * the memo are not asked for again, so priming twice costs nothing.
     *
     * @param  iterable<Tender>  $tenders
     */
    public static function prime(iterable $tenders): void
    {
        $memo = self::memo();
        $paths = [];

        foreach ($tenders as $tender) {
            foreach (self::rows($tender->documents) as $row) {
                $path = (string) ($row['file_path'] ?? '');

                if ($path !== '' && ! $memo->offsetExists($path)) {
                    $paths[] = $path;
                }
            }
        }

        if ($paths === []) {
            return;
        }

        self::load(array_values(array_unique($paths)));
    }

    /**
     * The public shape: what a page draws, in the editor's order.
     *
     * @param  array<int, array<string, mixed>>|null  $documents
     * @return list<array<string, mixed>>
     */
    public static function resolve(?array $documents): array
    {
        $out = [];

        foreach (self::resolved($documents) as [$row, $media]) {
            if ($media === null) {
                continue;
            }

            $out[] = array_filter([
                'title' => $row['title'] ?? $media->filename,
                'note' => $row['note'] ?? null,
                'url' => MediaUrl::for((string) $media->path),
                'size' => (int) $media->size,
                'extension' => self::extension($media),
            ], fn ($v) => $v !== null && $v !== '');
        }

        return $out;
    }

    /**
     * How many of them a page would actually draw.
     *
     * Counted the same way `resolve()` resolves, so an index row saying
     * "3 documents" cannot disagree with a page showing two.
     *
     * @param  array<int, array<string, mixed>>|null  $documents
     */
    public static function count(?array $documents): int
    {
        $n = 0;

        foreach (self::resolved($documents) as [, $media]) {
            if ($media !== null) {
                $n++;
            }
        }

        return $n;
    }

    /**
     * The console's shape: the stored path beside the resolved URL.
     *
     * The console needs the path — it is what a save posts back — and the
     * URL, to draw a link to the file. A screen given only the URL would
     * have to take the path back off it, which is the bug `onPick` already
     * documents for the media picker.
     *
     * @param  array<int, array<string, mixed>>|null  $documents
     * @return list<array<string, mixed>>
     */
    public static function forAdmin(?array $documents): array
    {
        $out = [];

        foreach (self::resolved($documents) as [$row, $media]) {
            $out[] = [
                'title' => (string) ($row['title'] ?? ''),
                'note' => $row['note'] ?? null,
                'file_path' => (string) ($row['file_path'] ?? ''),
                'url' => $media ? MediaUrl::for((string) $media->path) : null,
                'size' => $media ? (int) $media->size : null,
                'extension' => $media ? self::extension($media) : null,
                // The console says so rather than hiding it: a document
                // whose file somebody deleted from the library is still on
                // the record, and the editor is the only one who can fix it.
                'missing' => ! $media,
            ];
        }

        return $out;
    }

    /**
     * Each stored row paired with its media row, or null.
     *
     * @param  array<int, array<string, mixed>>|null  $documents
     * @return list<array{0: array<string, mixed>, 1: Media|null}>
     */
    private static function resolved(?array $documents): array
    {
        $rows = self::rows($documents);

        if ($rows === []) {
            return [];
        }

        $memo = self::memo();
        $missing = [];

        foreach ($rows as $row) {
            $path = (string) ($row['file_path'] ?? '');

            if ($path !== '' && ! $memo->offsetExists($path)) {
                $missing[] = $path;
            }
        }

        // One query for whatever this record needs and the page did not
        // already load — so an unprimed caller still costs one query, not
        // one per document.
        if ($missing !== []) {
            self::load(array_values(array_unique($missing)));
        }

        return array_map(
            fn (array $row) => [$row, $memo[(string) ($row['file_path'] ?? '')] ?? null],
            $rows,
        );
    }

    /**
     * @param  array<int, array<string, mixed>>|null  $documents
     * @return list<array<string, mixed>>
     */
    private static function rows(?array $documents): array
    {
        return array_values(array_filter((array) $documents, 'is_array'));
    }

    /** @param  list<string>  $paths */
    private static function load(array $paths): void
    {
        $memo = self::memo();

        /** @var Collection<string, Media> $found */
        $found = Media::query()
            ->whereIn('path', $paths)
            ->get(['id', 'path', 'filename', 'size', 'mime'])
            ->keyBy('path');

        // Every path asked for is written, a miss as null — so a file that
        // has gone is not asked for again on the next row.
        foreach ($paths as $path) {
            $memo[$path] = $found->get($path);
        }
    }

    private static function extension(Media $media): ?string
    {
        $name = (string) ($media->filename ?: $media->path);

        return strtolower(pathinfo($name, PATHINFO_EXTENSION)) ?: null;
    }

    /**
     * The per-request memo.
     *
     * A container instance rather than a `static`, because a static survives
     * from one test's application to the next — the trap `Setting::get()`'s
     * memo documents.
     */
    private static function memo(): \ArrayObject
    {
        return app()->bound(self::MEMO) ? app(self::MEMO) : app()->instance(self::MEMO, new \ArrayObject);
    }

    /**
     * Drop the memo.
     *
     * A web request gets its own container, so nothing needs this in
     * production — but a test's `getJson` calls share one application, so a
     * test that deletes a file and reads the page again would otherwise be
     * answered from the memo and pass for the wrong reason.
     */
    public static function forget(): void
    {
        app()->instance(self::MEMO, new \ArrayObject);
    }
}
