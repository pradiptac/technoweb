<?php

namespace App\Support\Media;

use App\Models\Media;
use App\Support\UploadLimits;
use Illuminate\Support\Facades\Storage;

/**
 * The blurred preview a picture is painted over while it loads (0.123.0).
 *
 * A twelve-pixel-wide WebP of the picture, as a `data:` URL. The frontend
 * hands it to `next/image` as `blurDataURL`, which stretches and blurs it
 * behind the `<img>` until the real bytes arrive, so a page of photographs
 * fills in from soft colour rather than from empty boxes.
 *
 * **Small on purpose.** It rides in every API response beside the picture's
 * alt text and again in the page's HTML, once per picture — so the budget is
 * a couple of hundred bytes, not a thumbnail. Twelve pixels is all a blur
 * can show anyway.
 *
 * **Never fails its caller.** An upload, an edit and a restore each call
 * this after the bytes are already on disk; a picture with no preview simply
 * loads the way every picture did before. So every failure — no GD, a
 * format it cannot open, a file larger than the megapixel limit — is an
 * empty string, which is also what the backfill records as "tried".
 */
final class Placeholder
{
    /** Width in pixels. `next/image` blurs it; more would only be more bytes. */
    private const WIDTH = 12;

    /** A very tall picture is held to this height, and narrowed to match. */
    private const MAX_HEIGHT = 24;

    /**
     * The preview for a library row's current bytes, or `''` when there is
     * none to make. Never null: null in the column means "not tried yet".
     */
    public static function forMedia(Media $medium): string
    {
        if (! $medium->isImage() || str_contains((string) $medium->mime, 'svg')) {
            return '';
        }

        try {
            return self::make(Storage::disk($medium->disk)->path($medium->path)) ?? '';
        } catch (\Throwable $e) {
            logger()->warning('A picture\'s blurred preview could not be made.', [
                'path' => $medium->path, 'error' => $e->getMessage(),
            ]);

            return '';
        }
    }

    /** A `data:` URL for the raster at this path, or null when it cannot be read. */
    public static function make(string $absolutePath): ?string
    {
        if (! function_exists('imagecreatetruecolor') || ! is_file($absolutePath)) {
            return null;
        }

        $info = @getimagesize($absolutePath);

        if (! $info || $info[0] < 1 || $info[1] < 1) {
            return null;
        }

        [$width, $height, $type] = $info;

        // Decoding is what costs memory, and the header says how much: the
        // rule `MediaUploader` refuses an upload by, applied to a file that
        // predates it or arrived another way.
        if (($width * $height) / 1_000_000 > UploadLimits::maxMegapixels()) {
            return null;
        }

        $source = match ($type) {
            IMAGETYPE_JPEG => @imagecreatefromjpeg($absolutePath),
            IMAGETYPE_PNG => @imagecreatefrompng($absolutePath),
            IMAGETYPE_WEBP => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($absolutePath) : false,
            IMAGETYPE_GIF => @imagecreatefromgif($absolutePath),
            default => false,
        };

        if (! $source) {
            return null;
        }

        $source = self::upright($source, $absolutePath, $type);
        [$width, $height] = [imagesx($source), imagesy($source)];

        $w = min(self::WIDTH, $width);
        $h = max(1, (int) round($height * $w / $width));

        if ($h > self::MAX_HEIGHT) {
            $h = self::MAX_HEIGHT;
            $w = max(1, (int) round($width * $h / $height));
        }

        // Transparent ground and alpha kept: a logo on no background must not
        // load from a black box.
        $small = imagecreatetruecolor($w, $h);
        imagealphablending($small, false);
        imagesavealpha($small, true);
        imagefill($small, 0, 0, (int) imagecolorallocatealpha($small, 0, 0, 0, 127));
        imagecopyresampled($small, $source, 0, 0, 0, 0, $w, $h, $width, $height);

        ob_start();
        $webp = function_exists('imagewebp');
        $written = $webp ? imagewebp($small, null, 40) : imagepng($small, null, 9);
        $bytes = (string) ob_get_clean();

        if (! $written || $bytes === '') {
            return null;
        }

        return 'data:image/'.($webp ? 'webp' : 'png').';base64,'.base64_encode($bytes);
    }

    /**
     * A JPEG turned the way its EXIF orientation says. A browser — and the
     * image optimiser — draws a phone's portrait photograph upright from
     * sideways pixels; a preview made from those pixels as stored would be a
     * sideways blur behind an upright picture.
     */
    private static function upright(\GdImage $image, string $path, int $type): \GdImage
    {
        if ($type !== IMAGETYPE_JPEG || ! function_exists('exif_read_data')) {
            return $image;
        }

        $orientation = (int) ((@exif_read_data($path) ?: [])['Orientation'] ?? 1);
        // GD rotates anticlockwise (the trap `ImageEditor` documents).
        $degrees = [3 => 180, 6 => 270, 8 => 90][$orientation] ?? 0;

        if ($degrees === 0) {
            return $image;
        }

        $turned = imagerotate($image, $degrees, 0);

        return $turned ?: $image;
    }
}
