<?php

namespace App\Support;

use RuntimeException;

/**
 * Resizing and thumbnailing, on GD.
 *
 * GD rather than Intervention or Imagick because it is the one that is
 * actually present here and it does everything this library needs: read a
 * raster image, scale it, write it back. Adding a dependency to wrap three
 * function calls would be its own maintenance.
 *
 * SVG is refused rather than passed through. A vector has no pixel dimensions
 * to change, so "resize" on one is a no-op that would report success and
 * leave the file exactly as it was — and most of this library is currently
 * SVG placeholder art, so that would be the common case rather than the
 * corner case.
 */
class ImageEditor
{
    /** What GD can open and write here. */
    public const RASTER = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

    public static function isResizable(string $mime): bool
    {
        return in_array($mime, self::RASTER, true);
    }

    /**
     * Scale the whole image to $width x $height.
     *
     * Stretches if the aspect ratios differ — that is what "resize to exactly
     * this" means, and the caller has asked for it. Use cover() when the
     * target shape is fixed and the content matters more than the edges.
     *
     * @return array{0:int,1:int,2:int}
     */
    public static function resize(string $absolutePath, string $destination, int $width, int $height): array
    {
        [$source, $mime] = self::open($absolutePath);

        return self::blit(
            $source, $mime, $destination,
            0, 0, imagesx($source), imagesy($source),
            $width, $height,
        );
    }

    /**
     * Fill $width x $height without distorting: take the largest centred
     * region of the source that already has the target aspect ratio, and
     * scale that.
     *
     * This is what a square thumbnail of a 4:3 photograph has to do. Scaling
     * the whole frame into a square squashes every face in it, which is what
     * the thumbnails here did until someone looked at one.
     *
     * @return array{0:int,1:int,2:int}
     */
    public static function cover(string $absolutePath, string $destination, int $width, int $height): array
    {
        [$source, $mime] = self::open($absolutePath);

        $sw = imagesx($source);
        $sh = imagesy($source);

        // The source rectangle with the target aspect, as large as will fit.
        $scale = min($sw / $width, $sh / $height);
        $cropW = max(1, (int) round($width * $scale));
        $cropH = max(1, (int) round($height * $scale));
        $x = (int) round(($sw - $cropW) / 2);
        $y = (int) round(($sh - $cropH) / 2);

        return self::blit($source, $mime, $destination, $x, $y, $cropW, $cropH, $width, $height);
    }

    /**
     * Cut $w x $h out of the source at ($x, $y), optionally scaling the
     * result to $outWidth x $outHeight.
     *
     * The rectangle is clamped to the image rather than rejected: a crop
     * selection is dragged with a pointer, and a couple of pixels past the
     * edge is a normal thing for a hand to do, not an error worth refusing.
     *
     * @return array{0:int,1:int,2:int}
     */
    public static function crop(
        string $absolutePath,
        string $destination,
        int $x,
        int $y,
        int $w,
        int $h,
        ?int $outWidth = null,
        ?int $outHeight = null,
    ): array {
        [$source, $mime] = self::open($absolutePath);

        $sw = imagesx($source);
        $sh = imagesy($source);

        $x = max(0, min($x, $sw - 1));
        $y = max(0, min($y, $sh - 1));
        $w = max(1, min($w, $sw - $x));
        $h = max(1, min($h, $sh - $y));

        return self::blit(
            $source, $mime, $destination,
            $x, $y, $w, $h,
            $outWidth ?: $w, $outHeight ?: $h,
        );
    }

    /**
     * Open a raster image, or say why not.
     *
     * @return array{0:\GdImage,1:string}
     */
    private static function open(string $absolutePath): array
    {
        $info = @getimagesize($absolutePath);

        if ($info === false) {
            throw new RuntimeException('That file could not be read as an image.');
        }

        $mime = $info['mime'];

        if (! self::isResizable($mime)) {
            throw new RuntimeException("{$mime} cannot be resized.");
        }

        $source = match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($absolutePath),
            'image/png' => @imagecreatefrompng($absolutePath),
            'image/gif' => @imagecreatefromgif($absolutePath),
            'image/webp' => @imagecreatefromwebp($absolutePath),
        };

        if (! $source) {
            throw new RuntimeException('That image could not be decoded.');
        }

        return [$source, $mime];
    }

    /**
     * Copy a source rectangle onto a new canvas and write it out. The one
     * place that touches GD's drawing calls, so transparency and encoding are
     * handled once rather than per operation.
     *
     * @return array{0:int,1:int,2:int}
     */
    private static function blit(
        \GdImage $source,
        string $mime,
        string $destination,
        int $sx,
        int $sy,
        int $sw,
        int $sh,
        int $width,
        int $height,
    ): array {
        $canvas = imagecreatetruecolor($width, $height);

        // PNG, GIF and WebP carry transparency, and a truecolor canvas starts
        // opaque black — without this every transparent logo comes back with
        // a black rectangle behind it.
        if (in_array($mime, ['image/png', 'image/gif', 'image/webp'], true)) {
            imagealphablending($canvas, false);
            imagesavealpha($canvas, true);
            imagefill($canvas, 0, 0, imagecolorallocatealpha($canvas, 0, 0, 0, 127));
        }

        imagecopyresampled($canvas, $source, 0, 0, $sx, $sy, $width, $height, $sw, $sh);

        $ok = match ($mime) {
            'image/jpeg' => imagejpeg($canvas, $destination, 86),
            'image/png' => imagepng($canvas, $destination, 6),
            'image/gif' => imagegif($canvas, $destination),
            'image/webp' => imagewebp($canvas, $destination, 86),
        };

        imagedestroy($source);
        imagedestroy($canvas);

        if (! $ok) {
            throw new RuntimeException('The resized image could not be written.');
        }

        return [$width, $height, (int) filesize($destination)];
    }

    /**
     * The height that keeps $width in proportion to the original.
     */
    public static function proportionalHeight(int $originalWidth, int $originalHeight, int $width): int
    {
        if ($originalWidth <= 0) {
            return $width;
        }

        return max(1, (int) round($width * ($originalHeight / $originalWidth)));
    }
}
