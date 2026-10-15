<?php

namespace App\Support\Media;

use App\Support\UploadLimits;
use Illuminate\Validation\ValidationException;
use ZipArchive;

/**
 * The content check for the three motion formats the library takes: a Lottie
 * animation (`json`), a packed one (`lottie`) and a 3D model (`glb`).
 *
 * `finfo` cannot tell these apart from any other JSON, zip or binary, so they
 * skip `mimes:` and are read here instead. The rule behind every refusal is the
 * same: the site draws them with no request to any other host and with no
 * decoder, so a file that names an outside address, or needs WebAssembly to
 * open, is refused when it is uploaded rather than failing in a visitor's
 * browser.
 */
final class MotionFiles
{
    public const EXTENSIONS = ['json', 'lottie', 'glb'];

    public const MAX_LOTTIE_KB = 5120;

    public const MAX_MODEL_KB = 25600;

    /** A zip entry read into memory, and the entries a `.lottie` may hold. */
    private const MAX_ENTRY_BYTES = 20 * 1024 * 1024;

    private const MAX_ZIP_ENTRIES = 200;

    private const DECODER_EXTENSIONS = [
        'KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu',
    ];

    public static function maxKb(string $ext): int
    {
        return min($ext === 'glb' ? self::MAX_MODEL_KB : self::MAX_LOTTIE_KB, UploadLimits::phpCeilingKb());
    }

    /**
     * @return array{mime: string, width: ?int, height: ?int}
     *
     * @throws ValidationException on the `file` key
     */
    public static function check(string $path, string $ext): array
    {
        return match ($ext) {
            'json' => self::json($path),
            'lottie' => self::lottie($path),
            default => self::glb($path),
        };
    }

    /** @return array{mime: string, width: ?int, height: ?int} */
    private static function json(string $path): array
    {
        [$w, $h] = self::animation((string) file_get_contents($path), fn () => false);

        return ['mime' => 'application/lottie+json', 'width' => $w, 'height' => $h];
    }

    /** @return array{mime: string, width: ?int, height: ?int} */
    private static function lottie(string $path): array
    {
        $zip = new ZipArchive;

        if ($zip->open($path) !== true) {
            self::refuse('That is not a Lottie file.');
        }

        try {
            if ($zip->numFiles > self::MAX_ZIP_ENTRIES) {
                self::refuse('That Lottie file holds too many files.');
            }

            $manifest = self::read($zip, 'manifest.json');
            $id = null;

            if ($manifest !== null) {
                $decoded = json_decode($manifest, true, 512);
                $first = is_array($decoded) ? ($decoded['animations'][0] ?? null) : null;
                $id = is_array($first) && is_string($first['id'] ?? null) ? $first['id'] : null;
            }

            // The id becomes an entry name in the zip, never a path on disk, but keep it plain anyway.
            $body = $id !== null && preg_match('#^[\w.\- ]+$#', $id) ? self::read($zip, "animations/{$id}.json") : null;

            if ($body === null) {
                self::refuse('That Lottie file has no animation in it.');
            }

            [$w, $h] = self::animation($body, fn (string $name) => $zip->locateName('images/'.basename($name)) !== false);
        } finally {
            $zip->close();
        }

        return ['mime' => 'application/lottie+zip', 'width' => $w, 'height' => $h];
    }

    private static function read(ZipArchive $zip, string $name): ?string
    {
        $stat = $zip->statName($name);

        if ($stat === false || $stat['size'] > self::MAX_ENTRY_BYTES) {
            return null;
        }

        $data = $zip->getFromName($name);

        return $data === false ? null : $data;
    }

    /**
     * @param  callable(string): bool  $packed  whether a picture the animation names is inside the same package
     * @return array{0: int, 1: int} width and height
     */
    private static function animation(string $raw, callable $packed): array
    {
        try {
            $doc = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            self::refuse('That file is not a Lottie animation.');
        }

        $valid = is_array($doc)
            && isset($doc['v'], $doc['fr'], $doc['ip'], $doc['op'])
            && is_numeric($doc['w'] ?? null) && is_numeric($doc['h'] ?? null)
            && is_array($doc['layers'] ?? null);

        if (! $valid) {
            self::refuse('That file is not a Lottie animation.');
        }

        foreach ((array) ($doc['assets'] ?? []) as $asset) {
            $p = is_array($asset) ? ($asset['p'] ?? null) : null;

            if (! is_string($p) || $p === '') {
                continue;
            }

            if (($asset['e'] ?? 0) == 1 || str_starts_with($p, 'data:') || $packed($p)) {
                continue;
            }

            self::refuse('This animation loads pictures from another site. Export it with its images embedded.');
        }

        return [(int) $doc['w'], (int) $doc['h']];
    }

    /** @return array{mime: string, width: null, height: null} */
    private static function glb(string $path): array
    {
        $size = (int) filesize($path);
        $handle = fopen($path, 'rb');
        $head = $handle ? (string) fread($handle, 20) : '';

        if (strlen($head) < 20 || substr($head, 0, 4) !== 'glTF') {
            self::refuse('That file is not a 3D model (.glb).');
        }

        $h = unpack('Vversion/Vlength/Vchunk/Vtype', substr($head, 4));

        // 0x4E4F534A is "JSON": the first chunk of a binary glTF always is.
        if ($h['version'] !== 2 || $h['length'] > $size || $h['type'] !== 0x4E4F534A || $h['chunk'] > $size) {
            self::refuse('That file is not a 3D model (.glb).');
        }

        $json = (string) fread($handle, $h['chunk']);
        fclose($handle);

        try {
            $doc = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            self::refuse('That file is not a 3D model (.glb).');
        }

        if (! is_array($doc)) {
            self::refuse('That file is not a 3D model (.glb).');
        }

        foreach (['buffers', 'images'] as $key) {
            foreach ((array) ($doc[$key] ?? []) as $entry) {
                $uri = is_array($entry) ? ($entry['uri'] ?? null) : null;

                if (is_string($uri) && ! str_starts_with($uri, 'data:')) {
                    self::refuse('This model loads files from another site. Export it as a single self-contained .glb.');
                }
            }
        }

        $used = array_merge((array) ($doc['extensionsUsed'] ?? []), (array) ($doc['extensionsRequired'] ?? []));

        if (array_intersect(self::DECODER_EXTENSIONS, $used)) {
            self::refuse('This model is compressed in a way the site cannot open without loading code from another site. Export it uncompressed (glTF binary, no Draco).');
        }

        return ['mime' => 'model/gltf-binary', 'width' => null, 'height' => null];
    }

    private static function refuse(string $message): never
    {
        throw ValidationException::withMessages(['file' => $message]);
    }
}
