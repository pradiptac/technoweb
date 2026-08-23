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
     * Scale the image at $absolutePath to $width x $height, writing to
     * $destination. Returns [width, height, bytes] as written.
     *
     * @return array{0:int,1:int,2:int}
     */
    public static function resize(string $absolutePath, string $destination, int $width, int $height): array
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

        $canvas = imagecreatetruecolor($width, $height);

        // PNG and WebP carry transparency, and a truecolor canvas starts
        // opaque black — without this every transparent logo comes back with
        // a black rectangle behind it.
        if (in_array($mime, ['image/png', 'image/gif', 'image/webp'], true)) {
            imagealphablending($canvas, false);
            imagesavealpha($canvas, true);
            imagefill($canvas, 0, 0, imagecolorallocatealpha($canvas, 0, 0, 0, 127));
        }

        imagecopyresampled(
            $canvas, $source,
            0, 0, 0, 0,
            $width, $height,
            imagesx($source), imagesy($source),
        );

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
