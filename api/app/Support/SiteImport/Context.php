<?php

namespace App\Support\SiteImport;

use App\Models\Media;
use App\Models\MediaFolder;
use App\Models\SiteImport;
use App\Support\Import\MediaDownload;
use App\Support\Import\PartsHost;
use App\Support\Media\MediaUploader;
use App\Support\Net\UnsafeUrl;
use App\Support\WordPress\ImportMap;
use App\Support\WordPress\Report;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Everything a step needs while a site import runs: the import and its
 * decisions, the scan's findings, the map, the report — and **media**.
 *
 * Media is fetched on demand, by what refers to it (a hero's picture, a
 * figure in a text section, a linked PDF, the share image), the way
 * `WordPress\Context::media()` does: one download per address per run, stored
 * through `MediaUploader::storeFromPath()` (the console upload's extension
 * list, size limit, megapixel ceiling and SVG sanitiser) and mapped so the
 * next reference and the next run reuse it. For a URL import the file is
 * fetched through `SafeHttp`; for a ZIP it is copied out of the unpacked
 * files. `planMedia()` is the dry run's: it counts and fetches nothing.
 */
final class Context implements PartsHost
{
    public const MEDIA_STEP = 'media';

    public readonly ImportMap $map;

    public Report $report;

    /**
     * The review's page table, built while planning.
     *
     * @var list<array<string, mixed>>
     */
    public array $rows = [];

    /** @var array<string, ?string> address => library path, for this run */
    private array $fetched = [];

    /** @var array<string, string> address => alt text, noted while reading pages */
    private array $alts = [];

    /** @var array<string, mixed> */
    private array $memo = [];

    private ?int $folderId = null;

    public function __construct(
        public readonly SiteImport $import,
        public readonly bool $dryRun,
        ?Report $report = null,
    ) {
        // The map's import id is for WordPress imports' foreign key; this one keys on its site hash alone.
        $this->map = new ImportMap($import->site, null);
        $this->report = $report ?? new Report;
    }

    public function map(): ImportMap
    {
        return $this->map;
    }

    public function report(): Report
    {
        return $this->report;
    }

    public function decision(string $key, mixed $default = null): mixed
    {
        return $this->import->decision($key, $default);
    }

    /** @return array<string, mixed> what the scan found out about the site */
    public function site(): array
    {
        return (array) (($this->import->analysis ?? [])['site'] ?? []);
    }

    public function siteUrl(): string
    {
        return $this->isZip() ? Paths::ZIP_ORIGIN : $this->import->site_url;
    }

    public function isZip(): bool
    {
        return $this->import->source === 'zip';
    }

    /**
     * Something worked out once per run.
     *
     * @template T
     *
     * @param  callable(): T  $work
     * @return T
     */
    public function memo(string $key, callable $work): mixed
    {
        if (! array_key_exists($key, $this->memo)) {
            $this->memo[$key] = $work();
        }

        return $this->memo[$key];
    }

    public function noteAlt(string $url, string $alt): void
    {
        if ($alt !== '') {
            $this->alts[$url] ??= $alt;
        }
    }

    /**
     * Count a picture or file a page would bring, and fetch nothing.
     * Returns a placeholder path, which is never stored.
     */
    public function planMedia(?string $url, string $label = ''): ?string
    {
        $skip = $this->refusal($url);

        if ($skip !== null) {
            return null;
        }

        $url = (string) $url;
        $key = 'url:'.sha1($url);

        if (array_key_exists('plan:'.$key, $this->fetched)) {
            return 'planned/'.$key;
        }

        $this->fetched['plan:'.$key] = null;

        // Counted in the review only: the commit counts what it fetches.
        if ($this->dryRun) {
            $this->report->count(self::MEDIA_STEP, $this->map->has('attachment_url', $key) ? 'update' : 'create');
            $this->map->plan('attachment_url', $key);
        }

        return 'planned/'.$key;
    }

    /**
     * The library path for a picture or file of the old site, or null when it
     * could not be brought across (counted and named under the media step).
     */
    public function media(?string $url, string $label = ''): ?string
    {
        if ($this->dryRun) {
            return $this->planMedia($url, $label);
        }

        if ($this->refusal($url) !== null) {
            return null;
        }

        $url = (string) $url;
        $key = 'url:'.sha1($url);

        if (array_key_exists($key, $this->fetched)) {
            return $this->fetched[$key];
        }

        if ($existing = $this->map->model('attachment_url', $key, Media::class)) {
            return $this->fetched[$key] = $existing->path;
        }

        $name = $label !== '' ? $label : basename((string) parse_url($url, PHP_URL_PATH));

        return $this->fetched[$key] = $this->store($url, $key, $name);
    }

    /** The URL a stored path is served at. */
    public static function mediaUrl(string $path): string
    {
        return Storage::disk('public')->url($path);
    }

    /**
     * Why this address cannot be a library file — also said in the review, so
     * the commit's refusal is no surprise.
     */
    private function refusal(?string $url): ?string
    {
        if ($url === null || $url === '' || ! preg_match('#^https?://#i', $url)) {
            return 'Not an address';
        }

        $extension = strtolower(pathinfo((string) parse_url($url, PHP_URL_PATH), PATHINFO_EXTENSION));

        if (! in_array($extension, MediaUploader::ALLOWED_EXTENSIONS, true)) {
            $key = 'refused:'.sha1($url);

            if (! isset($this->fetched[$key])) {
                $this->fetched[$key] = null;
                $this->report->count(self::MEDIA_STEP, 'skip');
                $this->report->reason(self::MEDIA_STEP, 'skip', 'Not a file type the library accepts'.($extension !== '' ? " (.{$extension})" : ' (no extension)').'.', basename((string) parse_url($url, PHP_URL_PATH)));
            }

            return 'Not a file type';
        }

        return null;
    }

    private function store(string $url, string $key, string $name): ?string
    {
        $tmp = null;

        try {
            $tmp = $this->isZip() ? $this->fromZip($url) : MediaDownload::toTemp(
                $url,
                (bool) config('site_import.allow_private_hosts'),
                (int) config('site_import.max_media_bytes'),
            );

            $filename = Str::limit(basename((string) parse_url($url, PHP_URL_PATH)) ?: 'file', 180, '');
            $alt = trim($this->alts[$url] ?? '');

            $media = DB::transaction(function () use ($tmp, $filename, $alt, $key, $url) {
                $media = MediaUploader::storeFromPath($tmp, $filename, $this->import->uploaded_by, [
                    'folder_id' => $this->folder(),
                    'alt_text' => $alt !== '' ? mb_substr($alt, 0, 255) : null,
                ]);
                $this->map->put('attachment_url', $key, $media, $url);

                return $media;
            });

            $this->report->count(self::MEDIA_STEP, 'create');

            return $media->path;
        } catch (Throwable $e) {
            $reason = $e instanceof UnsafeUrl || $e instanceof ValidationException
                ? 'Could not be brought across: '.($e instanceof ValidationException ? (string) collect($e->errors())->flatten()->first() : $e->getMessage())
                : 'Could not be downloaded.';
            $this->report->count(self::MEDIA_STEP, 'skip');
            $this->report->reason(self::MEDIA_STEP, 'skip', $reason, $name);
            Log::warning('A site import could not fetch a file', ['url' => $url, 'error' => $e->getMessage()]);

            return null;
        } finally {
            if ($tmp !== null) {
                @unlink($tmp);
            }
        }
    }

    /** A copy, in a temporary file, of the unpacked file an address names. */
    private function fromZip(string $url): string
    {
        $relative = ltrim(rawurldecode((string) parse_url($url, PHP_URL_PATH)), '/');
        $disk = Storage::disk('local');
        $path = ZipSource::filesDir($this->import).'/'.$relative;

        // Only a file the unpacker wrote, under the import's own folder.
        if (str_contains($relative, '..') || ! $disk->exists($path)) {
            throw new UnsafeUrl('The ZIP does not hold this file.');
        }

        $tmp = (string) tempnam(sys_get_temp_dir(), 'imp');
        file_put_contents($tmp, $disk->get($path));

        return $tmp;
    }

    private function folder(): int
    {
        return $this->folderId ??= (int) MediaFolder::query()->firstOrCreate(
            ['name' => 'Site import'],
            ['created_by' => $this->import->uploaded_by],
        )->id;
    }
}
