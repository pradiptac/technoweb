<?php

namespace App\Support\Downloads;

use App\Enums\DownloadSource;
use App\Models\Download;
use App\Models\Media;
use App\Support\Forms\FormUploads;
use App\Support\UploadLimits;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * A download's file: where a private one is kept, what may be uploaded, and
 * what either kind is called and weighs (docs/downloads.md).
 *
 * **The private disk, a hashed name.** Nothing under `downloads/` has a URL;
 * the two ways to a file are the public file route, which asks who is
 * reading when the download is customers-only, and the console's own. The
 * stored name is random and keeps only the extension; the name the file was
 * uploaded under is a label in a column, used for the `Content-Disposition`
 * and nothing else — the `FormUploads` rule.
 *
 * **An allowlist of extensions, and always an attachment.** Firmware and
 * installers cannot be checked by content the way a PDF can, so what makes
 * this safe is not the sniffing: the file is never executed by this server
 * (private disk), never rendered by a browser (`attachment`,
 * `application/octet-stream`, `nosniff`), and uploaded only by staff. The
 * list still refuses what a browser would run if it ever were served inline.
 */
class DownloadFiles
{
    public const DISK = 'local';

    public const FOLDER = 'downloads';

    /** Half a gigabyte, before php.ini has its say. */
    public const DEFAULT_MAX_KB = 524288;

    /**
     * What a private upload may be. Documents, archives, disk and firmware
     * images, installers and plain configuration — never markup or script
     * (`html`, `svg`, `js`, `php`), which is what the library's own list
     * refuses too.
     */
    public const EXTENSIONS = [
        // documents
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt', 'rtf',
        // archives
        'zip', '7z', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'xz',
        // firmware and disk images
        'bin', 'img', 'iso', 'fw', 'hex', 'rom', 'upg', 'pkg', 'swu', 'dfu',
        // installers and packages
        'exe', 'msi', 'dmg', 'deb', 'rpm', 'apk', 'appimage',
        // configuration and data
        'cfg', 'conf', 'ini', 'json', 'xml', 'yaml', 'yml', 'mib', 'lic',
    ];

    private const MEMO = 'downloads.library-files';

    /** The largest private upload this server will take, in KB. */
    public static function maxKb(): int
    {
        $configured = (int) config('downloads.max_upload_kb', self::DEFAULT_MAX_KB);

        return max(1, min($configured > 0 ? $configured : self::DEFAULT_MAX_KB, UploadLimits::phpCeilingKb()));
    }

    /**
     * Keep an upload, and say what it was.
     *
     * @return array{private_path: string, file_name: string, file_size: int, file_mime: string|null}
     */
    public static function store(UploadedFile $file): array
    {
        $extension = strtolower($file->getClientOriginalExtension());
        $name = bin2hex(random_bytes(20)).($extension !== '' ? '.'.$extension : '');
        $path = $file->storeAs(self::FOLDER, $name, self::DISK);

        if ($path === false) {
            throw new \RuntimeException('The upload could not be written.');
        }

        return [
            'private_path' => $path,
            'file_name' => FormUploads::displayName($file),
            'file_size' => (int) $file->getSize(),
            'file_mime' => $file->getMimeType(),
        ];
    }

    public static function discard(?string $path): void
    {
        // Only ever a file this class wrote: a path that is not under the
        // folder is not ours to delete, whatever a row says.
        if (is_string($path) && str_starts_with($path, self::FOLDER.'/')) {
            Storage::disk(self::DISK)->delete($path);
        }
    }

    public static function exists(Download $download): bool
    {
        return filled($download->private_path) && Storage::disk(self::DISK)->exists((string) $download->private_path);
    }

    /**
     * The private file, as a download.
     *
     * Always an attachment and always `application/octet-stream`: a browser
     * must save it, never render it — the file is whatever an editor
     * uploaded, and rendered inline it would run in the site's own origin.
     */
    public static function stream(Download $download): StreamedResponse
    {
        $name = (string) ($download->file_name ?: basename((string) $download->private_path));

        return Storage::disk(self::DISK)->download((string) $download->private_path, $name, [
            'Content-Type' => 'application/octet-stream',
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, no-store',
        ]);
    }

    /**
     * Count one download, without touching the row's `updated_at` — that is
     * the page's `lastmod`, and a file being fetched is not the page changing.
     */
    public static function count(Download $download): void
    {
        DB::table('downloads')->where('id', $download->id)->increment('download_count');
    }

    /**
     * Load the library rows a page of downloads needs in one query, so
     * `info()` asks the database once per request rather than once per row.
     *
     * @param  iterable<Download>  $downloads
     */
    public static function prime(iterable $downloads): void
    {
        $memo = self::memo();
        $paths = [];

        foreach ($downloads as $download) {
            if ($download->source === DownloadSource::Library && filled($download->file_path) && ! $memo->offsetExists((string) $download->file_path)) {
                $paths[] = (string) $download->file_path;
            }
        }

        if ($paths === []) {
            return;
        }

        $rows = Media::query()->whereIn('path', array_unique($paths))->get(['path', 'filename', 'size', 'mime'])->keyBy('path');

        foreach (array_unique($paths) as $path) {
            $memo[$path] = $rows->get($path);
        }
    }

    /**
     * What the file is called and weighs, whichever kind it is — or null when
     * there is no file to speak of (never uploaded, or gone from the library).
     *
     * @return array{name: string, extension: string|null, size: int, mime: string|null}|null
     */
    public static function info(Download $download): ?array
    {
        if ($download->source === DownloadSource::Upload) {
            if (blank($download->private_path)) {
                return null;
            }

            $name = (string) ($download->file_name ?: basename((string) $download->private_path));

            return [
                'name' => $name,
                'extension' => self::extension($name),
                'size' => (int) $download->file_size,
                'mime' => $download->file_mime,
            ];
        }

        if (blank($download->file_path)) {
            return null;
        }

        $memo = self::memo();
        $path = (string) $download->file_path;

        if (! $memo->offsetExists($path)) {
            self::prime([$download]);
        }

        /** @var Media|null $media */
        $media = $memo[$path] ?? null;

        if ($media === null) {
            return null;
        }

        $name = (string) ($media->filename ?: basename($path));

        return [
            'name' => $name,
            'extension' => self::extension($name) ?? self::extension($path),
            'size' => (int) $media->size,
            'mime' => $media->mime,
        ];
    }

    private static function extension(string $name): ?string
    {
        $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));

        return $extension !== '' && strlen($extension) <= 10 ? $extension : null;
    }

    /**
     * On the container rather than in a `static`, because a static survives
     * from one test's application to the next — `Setting::get()`'s rule.
     *
     * @return \ArrayObject<string, Media|null>
     */
    private static function memo(): \ArrayObject
    {
        return app()->bound(self::MEMO) ? app(self::MEMO) : app()->instance(self::MEMO, new \ArrayObject);
    }
}
