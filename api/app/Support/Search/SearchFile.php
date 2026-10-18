<?php

namespace App\Support\Search;

use App\Jobs\RebuildSearchFile;
use App\Models\SearchPassage;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * Every embedded passage of the current model packed into one file on the
 * private disk, so a search reads one file and never scans the table
 * (docs/semantic-search.md). Each record: passage id (uint32), subject id
 * (uint32), alias length (uint8) + alias, vector length (uint16) + float32s.
 *
 * Only queued work builds it: `markStale()` queues `RebuildSearchFile` after
 * commit, one at a time. A visitor's request reads whatever file exists, stale
 * or missing ([]), and scores it in place one vector at a time — never a
 * rebuild, never the whole index decoded. A file too big for the request's
 * memory is skipped with a warning (at most hourly), so search falls back to
 * words rather than ending in a fatal error.
 *
 * shortcut: cosine over every passage in PHP — about 0.3 s at 5,000 passages of 512 dimensions, 1.1 s at 20,000 (measured 2026-10-18); past a few thousand it needs a vector index.
 */
final class SearchFile
{
    /** Room left for the request beside the file's bytes. */
    private const HEADROOM = 16 * 1024 * 1024;

    private const MEMORY_WARNED_KEY = 'search:file-memory-warned';

    /** Mutable for the guard test only (ini_set cannot lower the limit below what a long run holds); null reads memory_limit. */
    public static ?string $memoryLimit = null;

    public static function markStale(): void
    {
        RebuildSearchFile::dispatch()->afterCommit();
    }

    public static function path(): string
    {
        return 'search/passages-'.substr(sha1(SemanticSettings::model()), 0, 12).'.bin';
    }

    /** The file's bytes as they are; '' when there is none or it would not fit in this request's memory. */
    public static function load(): string
    {
        $file = Storage::disk('local')->path(self::path());
        $size = is_file($file) ? (int) filesize($file) : 0;

        if ($size === 0) {
            return '';
        }

        if (! self::fits($size)) {
            if (Cache::add(self::MEMORY_WARNED_KEY, 1, 3600)) {
                Log::warning('Semantic search: the search file is too large for this server\'s memory_limit, so search by meaning is skipped', ['bytes' => $size, 'memory_limit' => ini_get('memory_limit')]);
            }

            return '';
        }

        return (string) file_get_contents($file);
    }

    /** Whether reading `$size` bytes (×3, plus headroom) fits in what memory_limit leaves; -1 is no limit. */
    public static function fits(int $size): bool
    {
        $limit = @ini_parse_quantity(self::$memoryLimit ?? (string) ini_get('memory_limit'));

        return $limit < 0 || $size * 3 + self::HEADROOM <= $limit - memory_get_usage();
    }

    /**
     * Walks the packed bytes without copying a vector.
     *
     * @return \Generator<int, array{0: int, 1: string, 2: int, 3: int, 4: int}> passage id, alias, subject id, the vector's offset, its length; a partial last record is dropped
     */
    public static function records(string $bytes): \Generator
    {
        $offset = 0;
        $length = strlen($bytes);

        while ($offset + 9 <= $length) {
            ['id' => $id, 'subject' => $subject, 'alias' => $aliasLength] = unpack('Vid/Vsubject/Calias', $bytes, $offset);
            $next = $offset + 9;
            if ($next + $aliasLength + 2 > $length) {
                return;
            }
            $alias = substr($bytes, $next, $aliasLength);
            $next += $aliasLength;
            $dims = unpack('v', $bytes, $next)[1];
            $next += 2;
            if ($next + $dims * 4 > $length) {
                return;
            }
            yield [$id, $alias, $subject, $next, $dims];
            $offset = $next + $dims * 4;
        }
    }

    /** Builds the file for the current model, streamed to disk, and deletes any other model's. */
    public static function rebuild(): void
    {
        $model = SemanticSettings::model();
        $disk = Storage::disk('local');
        $disk->makeDirectory('search');
        $path = self::path();
        $tmp = $path.'.'.bin2hex(random_bytes(4)).'.tmp';
        $handle = fopen($disk->path($tmp), 'wb');

        SearchPassage::query()->where('model', $model)->whereNotNull('embedded_at')
            ->select(['id', 'subject_type', 'subject_id', 'vector'])
            ->lazyById(500)
            ->each(function (SearchPassage $p) use ($handle) {
                $vector = (string) $p->vector;
                fwrite($handle, pack('VVC', $p->id, $p->subject_id, strlen($p->subject_type)).$p->subject_type.pack('v', intdiv(strlen($vector), 4)).$vector);
            });

        fclose($handle);
        // Written beside and renamed over, so a reader never sees half a file.
        rename($disk->path($tmp), $disk->path($path));

        foreach ($disk->files('search') as $file) {
            if ($file !== $path && str_starts_with(basename($file), 'passages-') && str_ends_with($file, '.bin')) {
                $disk->delete($file);
            }
        }
    }
}
