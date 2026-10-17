<?php

namespace App\Support\Search;

use App\Models\SearchPassage;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;

/**
 * Every embedded passage of the current model packed into one file on the
 * private disk, so a search reads one file and never scans the table
 * (docs/semantic-search.md). Each record: passage id (uint32), subject id
 * (uint32), alias length (uint8) + alias, vector length (uint16) + float32s.
 * Rebuilt when marked stale (an index changed something) at most once a
 * minute, and when missing.
 *
 * Vectors stay packed in the memo (2 KB each) and are unpacked one at a time
 * while scoring.
 *
 * shortcut: cosine over every passage in PHP is comfortable to a few thousand passages; tens of thousands costs a few hundred ms per search and needs a vector index.
 */
final class SearchFile
{
    public const STALE_KEY = 'search:file-stale';

    private const REBUILD_LOCK = 'search:file-rebuilding:';

    /** @var array<string, list<array{0: int, 1: string, 2: int, 3: string}>> */
    private static array $memo = [];

    public static function markStale(): void
    {
        Cache::forever(self::STALE_KEY, true);
        self::$memo = [];
    }

    /** For tests: forget the per-process copy. */
    public static function flushMemo(): void
    {
        self::$memo = [];
    }

    public static function path(): string
    {
        return 'search/passages-'.substr(sha1(SemanticSettings::model()), 0, 12).'.bin';
    }

    /** @return list<array{0: int, 1: string, 2: int, 3: string}> */
    public static function load(): array
    {
        $path = self::path();
        $disk = Storage::disk('local');

        if ((Cache::get(self::STALE_KEY) || ! $disk->exists($path)) && Cache::add(self::REBUILD_LOCK.sha1($path), 1, 60)) {
            self::rebuild();
        }

        if (isset(self::$memo[$path])) {
            return self::$memo[$path];
        }

        $bytes = $disk->exists($path) ? (string) $disk->get($path) : '';

        return self::$memo[$path] = self::decode($bytes);
    }

    public static function rebuild(): void
    {
        $model = SemanticSettings::model();
        $out = '';

        // Cleared before reading, so a change landing mid-build marks it stale again.
        Cache::forget(self::STALE_KEY);

        SearchPassage::query()->where('model', $model)->whereNotNull('embedded_at')->orderBy('id')
            ->select(['id', 'subject_type', 'subject_id', 'vector'])
            ->lazyById(500)
            ->each(function (SearchPassage $p) use (&$out) {
                $vector = (string) $p->vector;
                $out .= pack('VVC', $p->id, $p->subject_id, strlen($p->subject_type)).$p->subject_type.pack('v', intdiv(strlen($vector), 4)).$vector;
            });

        // Written beside and renamed over, so a reader never sees half a file.
        $disk = Storage::disk('local');
        $tmp = self::path().'.'.bin2hex(random_bytes(4)).'.tmp';
        $disk->put($tmp, $out);
        rename($disk->path($tmp), $disk->path(self::path()));
        self::$memo = [];
    }

    /** @return list<array{0: int, 1: string, 2: int, 3: string}> a partial last record is dropped */
    private static function decode(string $bytes): array
    {
        $rows = [];
        $offset = 0;
        $length = strlen($bytes);

        while ($offset + 9 <= $length) {
            ['id' => $id, 'subject' => $subject, 'alias' => $aliasLength] = unpack('Vid/Vsubject/Calias', $bytes, $offset);
            $next = $offset + 9;
            if ($next + $aliasLength + 2 > $length) {
                break;
            }
            $alias = substr($bytes, $next, $aliasLength);
            $next += $aliasLength;
            $size = unpack('v', $bytes, $next)[1] * 4;
            $next += 2;
            if ($next + $size > $length) {
                break;
            }
            $rows[] = [$id, $alias, $subject, substr($bytes, $next, $size)];
            $offset = $next + $size;
        }

        return $rows;
    }
}
