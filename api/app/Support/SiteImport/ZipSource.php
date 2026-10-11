<?php

namespace App\Support\SiteImport;

use App\Models\SiteImport;
use App\Support\WordPress\Harvest;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use ZipArchive;

/**
 * An uploaded website, unpacked into the harvest a slice at a time.
 *
 * **Nothing in the ZIP is ever executed or served.** HTML files become pages
 * in `pages.jsonl`; stylesheets, pictures, PDFs and fonts are written under
 * the import's `files/` folder on the private disk, from where the media step
 * copies the ones a page uses into the library (which checks them again).
 * Everything else — scripts, PHP, archives — is named in the review and left
 * in the ZIP.
 *
 * A name is trusted for nothing: `relative()` is the zip-slip check (modelled
 * on `BackupPaths::restoreTarget`) and refuses an absolute path, a drive
 * letter, a `..` segment or a NUL byte. Caps bound a zip bomb: the file
 * count, the declared unpacked size up front, and the bytes actually read per
 * file and in total.
 */
final class ZipSource
{
    public const PAUSED = 'paused';

    public const DONE = 'done';

    /** Pages that are an error page, not content. */
    private const ERROR_PAGES = '#(^|/)(404|403|500|error)\.html?$#i';

    public function run(SiteImport $import, ScanState $state, Harvest $harvest, CarbonImmutable $deadline): string
    {
        $zip = new ZipArchive;
        $path = Storage::disk(Harvest::DISK)->path((string) $import->zip_path);

        if (! is_file($path) || $zip->open($path) !== true) {
            throw new RuntimeException('The ZIP could not be opened. Is it a damaged or password-protected file?');
        }

        try {
            return $this->unpack($zip, $import, $state, $harvest, $deadline);
        } finally {
            $zip->close();
        }
    }

    private function unpack(ZipArchive $zip, SiteImport $import, ScanState $state, Harvest $harvest, CarbonImmutable $deadline): string
    {
        $limits = (array) config('site_import.zip');

        if ($state->zip === []) {
            if ($zip->numFiles > (int) $limits['max_files']) {
                throw new RuntimeException("The ZIP holds {$zip->numFiles} files; the limit is ".number_format((int) $limits['max_files']).'.');
            }

            $declared = 0;
            $names = [];

            for ($i = 0; $i < $zip->numFiles; $i++) {
                $stat = $zip->statIndex($i);
                $declared += (int) ($stat['size'] ?? 0);
                $names[] = (string) ($stat['name'] ?? '');
            }

            if ($declared > (int) $limits['max_unpacked_bytes']) {
                throw new RuntimeException('The ZIP unpacks to '.round($declared / 1048576).' MB; the limit is '.round((int) $limits['max_unpacked_bytes'] / 1048576).' MB.');
            }

            $state->zip = ['index' => 0, 'files' => 0, 'bytes' => 0, 'prefix' => self::prefix($names), 'total' => $zip->numFiles];
        }

        $worked = false;

        for ($i = (int) $state->zip['index']; $i < $zip->numFiles; $i++) {
            if ($worked && CarbonImmutable::now()->greaterThanOrEqualTo($deadline)) {
                $state->zip['index'] = $i;

                return self::PAUSED;
            }

            $worked = true;
            $stat = $zip->statIndex($i);
            $name = (string) ($stat['name'] ?? '');

            if ($name === '' || str_ends_with($name, '/') || str_starts_with($name, '__MACOSX/')) {
                continue;
            }

            $relative = self::relative($name, $state->zip['prefix']);

            if ($relative === null) {
                $state->skip('A file with an unsafe path (it tried to leave the folder it was unpacked into).', $name);

                continue;
            }

            if (str_starts_with(basename($relative), '.')) {
                continue;
            }

            $extension = strtolower(pathinfo($relative, PATHINFO_EXTENSION));

            if (! in_array($extension, (array) $limits['extensions'], true)) {
                $state->skip('A kind of file the import does not keep'.($extension !== '' ? " (.{$extension})" : '').'.', $relative);

                continue;
            }

            $isPage = in_array($extension, ['html', 'htm'], true);
            $cap = $isPage ? (int) config('site_import.max_bytes') : (int) config('site_import.max_media_bytes');

            if ((int) ($stat['size'] ?? 0) > $cap) {
                $state->skip('Larger than the import reads ('.round($cap / 1048576).' MB).', $relative);

                continue;
            }

            $bytes = $this->read($zip, $i, $cap, (int) $limits['max_unpacked_bytes'] - (int) $state->zip['bytes']);

            if ($bytes === null) {
                $state->skip('Larger than the import reads, or the ZIP\'s sizes do not add up.', $relative);

                continue;
            }

            $state->zip['bytes'] += strlen($bytes);
            $state->zip['files']++;

            if ($isPage) {
                if (preg_match(self::ERROR_PAGES, $relative)) {
                    $state->skip('An error page, not content.', $relative);

                    continue;
                }

                $html = mb_convert_encoding(self::utf8($bytes), 'UTF-8', 'UTF-8');
                $harvest->append($import, 'pages', [[
                    'url' => Paths::ZIP_ORIGIN.'/'.$relative,
                    'path' => Paths::normalise($relative),
                    'title' => SiteCrawler::title($html),
                    'status' => 200,
                    'html' => $html,
                ]]);
                $state->pages++;
            } else {
                Storage::disk(Harvest::DISK)->put(self::filesDir($import).'/'.$relative, $bytes);
            }
        }

        $state->zip['index'] = $zip->numFiles;

        return self::DONE;
    }

    /** One entry's bytes, or null if it runs past `$cap` or the unpacked budget. */
    private function read(ZipArchive $zip, int $index, int $cap, int $budget): ?string
    {
        $stream = $zip->getStreamIndex($index);

        if ($stream === false) {
            return null;
        }

        $limit = min($cap, max(0, $budget));
        $out = '';

        while (! feof($stream)) {
            $chunk = fread($stream, 65536);

            if ($chunk === false) {
                break;
            }

            $out .= $chunk;

            if (strlen($out) > $limit) {
                fclose($stream);

                return null;
            }
        }

        fclose($stream);

        return $out;
    }

    /**
     * An entry's path inside the unpacked folder, or null when it is unsafe.
     * `$prefix` is the one top-level folder the whole ZIP sits in, if any.
     */
    public static function relative(string $name, ?string $prefix = null): ?string
    {
        $name = str_replace('\\', '/', $name);

        if ($name === '' || str_contains($name, "\0") || str_starts_with($name, '/') || preg_match('#^[A-Za-z]:#', $name)) {
            return null;
        }

        foreach (explode('/', $name) as $segment) {
            if ($segment === '..') {
                return null;
            }
        }

        if ($prefix !== null && $prefix !== '' && str_starts_with($name, $prefix.'/')) {
            $name = substr($name, strlen($prefix) + 1);
        }

        $name = trim((string) preg_replace('#/{2,}#', '/', $name), '/');

        return $name === '' ? null : $name;
    }

    /**
     * The single folder every file sits in (`site/index.html`, `site/css/…`),
     * so the folder's own name is not part of every address.
     *
     * @param  list<string>  $names
     */
    public static function prefix(array $names): ?string
    {
        $first = null;

        foreach ($names as $name) {
            $name = str_replace('\\', '/', $name);

            // An unsafe entry is refused later and says nothing about the folder the rest sit in.
            if ($name === '' || str_ends_with($name, '/') || str_starts_with($name, '__MACOSX/') || self::relative($name) === null) {
                continue;
            }

            if (! str_contains($name, '/')) {
                return null;
            }

            $top = explode('/', $name)[0];

            if ($first !== null && $first !== $top) {
                return null;
            }

            $first = $top;
        }

        return $first === '..' ? null : $first;
    }

    public static function filesDir(SiteImport $import): string
    {
        return Harvest::dir($import).'/files';
    }

    /** A page's bytes as UTF-8, by its `<meta charset>` or by detection. */
    private static function utf8(string $html): string
    {
        $charset = preg_match('/<meta[^>]+charset=["\']?([\w-]+)/i', substr($html, 0, 4096), $m) ? strtoupper($m[1]) : null;
        $known = array_map('strtoupper', mb_list_encodings());

        if ($charset !== null && $charset !== 'UTF-8' && in_array($charset, $known, true)) {
            return mb_convert_encoding($html, 'UTF-8', $charset);
        }

        if (! mb_check_encoding($html, 'UTF-8')) {
            return mb_convert_encoding($html, 'UTF-8', mb_detect_encoding($html, ['UTF-8', 'Windows-1252', 'ISO-8859-1'], true) ?: 'Windows-1252');
        }

        return $html;
    }
}
