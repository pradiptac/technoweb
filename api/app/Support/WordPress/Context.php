<?php

namespace App\Support\WordPress;

use App\Models\Media;
use App\Models\MediaFolder;
use App\Models\User;
use App\Models\WordPressImport;
use App\Support\Media\MediaUploader;
use App\Support\Net\SafeHttp;
use App\Support\Net\UnsafeUrl;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Everything a step needs while it runs: the import and its decisions, the
 * harvest's site facts, the map, the report — and the two services every
 * step shares, **media** and **lookups**.
 *
 * Media is fetched on demand rather than in a step of its own, because what
 * to fetch is decided by what refers to it: a post's featured image, a
 * product's gallery, an `<img>` in a body, an ACF picture. `media()` returns
 * the library path for a WordPress attachment id or an upload URL —
 * downloading it once (through `SafeHttp`, so an upload URL pointing into
 * this server's network is refused like any other), storing it through
 * `MediaUploader::storeFromPath()` (the same extension list, size limit,
 * megapixel ceiling and SVG sanitiser as a console upload), and mapping it
 * so the next reference and the next run reuse it. In a dry run it downloads
 * nothing and counts what it would.
 *
 * Lookups (`record()`, `children()`) index a harvest collection by id or by
 * `_parent` the first time a step asks, and keep it for the run.
 */
final class Context
{
    public const MEDIA_STEP = 'media';

    public readonly ImportMap $map;

    public Report $report;

    /** @var array<string, array<string, array<string, mixed>>> */
    private array $index = [];

    /** @var array<string, array<string, list<array<string, mixed>>>> */
    private array $byParent = [];

    /** @var array<int, ?int> WordPress user id => staff id */
    private array $authors = [];

    private ?int $folderId = null;

    /** @var array<string, ?string> source URL => path, for this run */
    private array $fetched = [];

    /** @var array<string, mixed> */
    private array $memo = [];

    public function __construct(
        public readonly WordPressImport $import,
        public readonly bool $dryRun,
        ?Report $report = null,
    ) {
        $this->map = new ImportMap($import->site, $import->id);
        $this->report = $report ?? new Report;
    }

    /** @return array<string, mixed> the site facts the scan recorded */
    public function site(): array
    {
        return (array) (($this->import->analysis ?? [])['site'] ?? []);
    }

    /** A WooCommerce setting the scan read, e.g. `woocommerce_currency`. */
    public function wc(string $key, mixed $default = null): mixed
    {
        return ($this->site()['wc'] ?? [])[$key] ?? $default;
    }

    public function decision(string $key, mixed $default = null): mixed
    {
        return $this->import->decision($key, $default);
    }

    /**
     * Something worked out once per run — the review options, which the
     * steps consult per record.
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

    /** @return ?array<string, mixed> one harvested record by id */
    public function record(string $collection, int|string|null $id): ?array
    {
        if ($id === null) {
            return null;
        }

        if (! isset($this->index[$collection])) {
            $this->index[$collection] = [];
            foreach (Harvest::read($this->import, $collection) as $row) {
                if (isset($row['id'])) {
                    $this->index[$collection][(string) $row['id']] = $row;
                }
            }
        }

        return $this->index[$collection][(string) $id] ?? null;
    }

    /** @return list<array<string, mixed>> the records a parent spawned (variations, order notes) */
    public function children(string $collection, int|string $parent): array
    {
        if (! isset($this->byParent[$collection])) {
            $this->byParent[$collection] = [];
            foreach (Harvest::read($this->import, $collection) as $row) {
                $this->byParent[$collection][(string) ($row['_parent'] ?? '')][] = $row;
            }
        }

        return $this->byParent[$collection][(string) $parent] ?? [];
    }

    /**
     * The staff account a WordPress author becomes: the one with the same
     * address, or nobody. Staff are never created by an import — an editor
     * account on the old site is not a decision about who administers this
     * one.
     */
    public function author(?int $wpUserId): ?int
    {
        if ($wpUserId === null || $wpUserId === 0) {
            return null;
        }

        if (! array_key_exists($wpUserId, $this->authors)) {
            $email = strtolower((string) ($this->record('users', $wpUserId)['email'] ?? ''));
            $this->authors[$wpUserId] = $email === '' ? null : User::query()->where('email', $email)->value('id');
        }

        return $this->authors[$wpUserId];
    }

    /**
     * The library path for an attachment id or an upload URL, or null when
     * there is none or it could not be brought across (counted and named
     * under the media step either way).
     */
    public function media(int|string|null $source, string $label = ''): ?string
    {
        if ($source === null || $source === '' || $source === 0) {
            return null;
        }

        $attachment = is_int($source) || ctype_digit((string) $source) ? $this->record('media', (int) $source) : null;
        $url = $attachment !== null ? (string) ($attachment['source_url'] ?? '') : (string) $source;

        if ($url === '' || ! preg_match('#^https?://#i', $url)) {
            return null;
        }

        $key = $attachment !== null ? (string) $attachment['id'] : 'url:'.sha1($url);
        $mapType = $attachment !== null ? 'attachment' : 'attachment_url';

        if (array_key_exists($key, $this->fetched)) {
            return $this->fetched[$key];
        }

        if ($existing = $this->map->model($mapType, $key, Media::class)) {
            return $this->fetched[$key] = $existing->path;
        }

        $name = $label !== '' ? $label : basename((string) parse_url($url, PHP_URL_PATH));
        $extension = strtolower(pathinfo((string) parse_url($url, PHP_URL_PATH), PATHINFO_EXTENSION));

        // Said in the preview as well as refused at commit: the commit's
        // content check would refuse it anyway, and a surprise then is worse.
        if (! in_array($extension, MediaUploader::ALLOWED_EXTENSIONS, true)) {
            $this->report->count(self::MEDIA_STEP, 'skip');
            $this->report->reason(self::MEDIA_STEP, 'skip', 'Not a file type the library accepts'.($extension !== '' ? " (.{$extension})" : '').'.', $name);

            return $this->fetched[$key] = null;
        }

        if ($this->dryRun) {
            $this->report->count(self::MEDIA_STEP, $this->map->has($mapType, $key) ? 'update' : 'create');
            $this->map->plan($mapType, $key);

            return $this->fetched[$key] = 'planned/'.$key;
        }

        return $this->fetched[$key] = $this->download($url, $mapType, $key, $name, $attachment);
    }

    /**
     * @param  ?array<string, mixed>  $attachment
     */
    private function download(string $url, string $mapType, string $key, string $name, ?array $attachment): ?string
    {
        $tmp = tempnam(sys_get_temp_dir(), 'wpi');

        try {
            $response = SafeHttp::get($url, [
                'sink' => $tmp,
                'timeout' => 30,
                'max_bytes' => (int) config('wordpress_import.max_media_bytes'),
                'allow_private' => (bool) config('wordpress_import.allow_private_hosts'),
                'allow_http' => true,
            ]);

            if (! $response->successful()) {
                throw new UnsafeUrl("The site answered {$response->status()}.");
            }

            // A client that ignored the sink (a faked one does) still handed back the body.
            if ((int) @filesize($tmp) === 0) {
                file_put_contents($tmp, $response->body());
            }

            $filename = Str::limit(basename((string) parse_url($url, PHP_URL_PATH)) ?: 'file', 180, '');
            $alt = $attachment !== null ? trim((string) ($attachment['alt_text'] ?? '')) : '';

            $media = DB::transaction(function () use ($tmp, $filename, $alt, $mapType, $key, $url) {
                $media = MediaUploader::storeFromPath($tmp, $filename, $this->import->uploaded_by, [
                    'folder_id' => $this->folder(),
                    'alt_text' => $alt !== '' ? mb_substr($alt, 0, 255) : null,
                ]);
                $this->map->put($mapType, $key, $media, $url);

                return $media;
            });

            $this->report->count(self::MEDIA_STEP, 'create');

            return $media->path;
        } catch (Throwable $e) {
            $reason = $e instanceof UnsafeUrl || $e instanceof ValidationException
                ? 'Could not be brought across: '.self::firstMessage($e)
                : 'Could not be downloaded.';
            $this->report->count(self::MEDIA_STEP, 'skip');
            $this->report->reason(self::MEDIA_STEP, 'skip', $reason, $name);
            Log::warning('A WordPress import could not fetch a file', ['url' => $url, 'error' => $e->getMessage()]);

            return null;
        } finally {
            @unlink($tmp);
        }
    }

    /** The URL a stored path is served at. */
    public static function mediaUrl(string $path): string
    {
        return Storage::disk('public')->url($path);
    }

    private function folder(): int
    {
        return $this->folderId ??= (int) MediaFolder::query()->firstOrCreate(
            ['name' => 'WordPress import'],
            ['created_by' => $this->import->uploaded_by],
        )->id;
    }

    private static function firstMessage(Throwable $e): string
    {
        if ($e instanceof ValidationException) {
            return (string) collect($e->errors())->flatten()->first();
        }

        return $e->getMessage();
    }
}
