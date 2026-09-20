<?php

namespace App\Support;

use App\Enums\ImageQuality;
use RuntimeException;

/**
 * Resizing and thumbnailing, on GD.
 *
 * GD rather than Intervention or Imagick because it is the one that is
 * actually present here and it does everything this library needs: read a
 * raster image, scale it, write it back. Adding a dependency to wrap three
 * function calls would be its own maintenance.
 *
 * **Every write here is compressed to the `image_quality` setting**, and every
 * write here is a *derived* image — a resize, a crop, a thumbnail, a rotate.
 * An upload is stored as it arrived: re-encoding somebody's original on the
 * way in throws away quality they cannot get back, and it is the only copy
 * there is.
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

    /**
     * The compression preset, read once per request.
     *
     * Memoised because a single resize with three thumbnails encodes four
     * times, and asking the settings table four times for a value that cannot
     * change mid-request is three queries bought with nothing. Cleared
     * naturally by the process ending; `forgetQuality()` exists for tests,
     * which change the setting inside one process.
     */
    private static ?ImageQuality $quality = null;

    private static function quality(): ImageQuality
    {
        return self::$quality ??= ImageQuality::current();
    }

    /** Drops the memoised preset. Only a test needs this. */
    public static function forgetQuality(): void
    {
        self::$quality = null;
    }

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
     * Turn the image a quarter, a half or three quarters of a turn.
     *
     * Only right angles are offered, and that is a decision rather than a
     * limitation. An arbitrary angle has to invent pixels in the corners —
     * GD fills them with a colour you have to choose, which is a visible
     * border on anything that is not already that colour. Straightening a
     * crooked horizon needs a crop afterwards to hide it, which is a different
     * feature; turning a photograph the right way up needs exactly this.
     *
     * `imagerotate` measures anticlockwise, so the caller's clockwise degrees
     * are subtracted from 360. Getting that backwards is invisible on 180 and
     * exactly wrong on the two that matter.
     *
     * @return array{0:int,1:int,2:int}
     */
    public static function rotate(string $absolutePath, string $destination, int $degrees): array
    {
        if (! in_array($degrees, [90, 180, 270], true)) {
            throw new RuntimeException('Only quarter turns are supported.');
        }

        [$source, $mime] = self::open($absolutePath);

        $transparent = in_array($mime, ['image/png', 'image/gif', 'image/webp'], true);

        if ($transparent) {
            // Without this the pixels rotated in from outside the original
            // frame are opaque black rather than nothing.
            imagealphablending($source, false);
            imagesavealpha($source, true);
        }

        $rotated = imagerotate($source, 360 - $degrees, imagecolorallocatealpha($source, 0, 0, 0, 127));
        imagedestroy($source);

        if (! $rotated) {
            throw new RuntimeException('That image could not be rotated.');
        }

        return self::write($rotated, $mime, $destination, $transparent);
    }

    /**
     * Mirror the image horizontally or vertically.
     *
     * Horizontal is the one people want — it is what makes a subject face into
     * a layout rather than out of it. Vertical is here because the cost is one
     * more case in a `match`, and because a photograph of a reflection is a
     * real thing somebody occasionally has upside down.
     *
     * @return array{0:int,1:int,2:int}
     */
    public static function flip(string $absolutePath, string $destination, string $axis): array
    {
        $mode = match ($axis) {
            'horizontal' => IMG_FLIP_HORIZONTAL,
            'vertical' => IMG_FLIP_VERTICAL,
            default => throw new RuntimeException('A flip is horizontal or vertical.'),
        };

        [$source, $mime] = self::open($absolutePath);

        $transparent = in_array($mime, ['image/png', 'image/gif', 'image/webp'], true);
        if ($transparent) {
            imagealphablending($source, false);
            imagesavealpha($source, true);
        }

        if (! imageflip($source, $mode)) {
            imagedestroy($source);
            throw new RuntimeException('That image could not be flipped.');
        }

        return self::write($source, $mime, $destination, $transparent);
    }

    /**
     * Brightness, contrast and greyscale, in that order.
     *
     * GD's filters are applied to the image in place and each is a whole-image
     * pass, so the order is the result: greyscale after a contrast change is
     * not the same picture as contrast after greyscale. Fixed here rather than
     * left to the caller, so the same three numbers always produce the same
     * image.
     *
     * The ranges are GD's own. `IMG_FILTER_BRIGHTNESS` runs -255..255 and
     * `IMG_FILTER_CONTRAST` runs -100..100 **and is inverted** — a positive
     * value flattens the image. That last one is the trap: passing a "more
     * contrast" slider straight through produces less, and it looks like the
     * filter is simply weak rather than backwards.
     *
     * @return array{0:int,1:int,2:int}
     */
    public static function adjust(
        string $absolutePath,
        string $destination,
        int $brightness = 0,
        int $contrast = 0,
        bool $greyscale = false,
    ): array {
        [$source, $mime] = self::open($absolutePath);

        $transparent = in_array($mime, ['image/png', 'image/gif', 'image/webp'], true);
        if ($transparent) {
            imagealphablending($source, false);
            imagesavealpha($source, true);
        }

        if ($brightness !== 0) {
            imagefilter($source, IMG_FILTER_BRIGHTNESS, max(-255, min(255, $brightness)));
        }

        if ($contrast !== 0) {
            // Negated: see the docblock. GD's scale runs the other way.
            imagefilter($source, IMG_FILTER_CONTRAST, -max(-100, min(100, $contrast)));
        }

        if ($greyscale) {
            imagefilter($source, IMG_FILTER_GRAYSCALE);
        }

        return self::write($source, $mime, $destination, $transparent);
    }

    /**
     * Encode an already-built image.
     *
     * `blit` owns the copy-and-scale path; this owns the write, so the two
     * quality settings and the transparency flags are stated once. The
     * operations above transform in place and have nothing to copy.
     *
     * @return array{0:int,1:int,2:int}
     */
    private static function write(\GdImage $image, string $mime, string $destination, bool $transparent): array
    {
        if ($transparent) {
            imagealphablending($image, false);
            imagesavealpha($image, true);
        }

        $quality = self::quality();

        $ok = match ($mime) {
            'image/jpeg' => imagejpeg($image, $destination, $quality->lossy()),
            'image/png' => imagepng($image, $destination, $quality->pngEffort()),
            'image/gif' => imagegif($image, $destination),
            'image/webp' => imagewebp($image, $destination, $quality->lossy()),
        };

        $width = imagesx($image);
        $height = imagesy($image);
        imagedestroy($image);

        if (! $ok) {
            throw new RuntimeException('The edited image could not be written.');
        }

        return [$width, $height, (int) filesize($destination)];
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

        $quality = self::quality();

        $ok = match ($mime) {
            'image/jpeg' => imagejpeg($canvas, $destination, $quality->lossy()),
            // Lossless: this number is effort, not quality. See ImageQuality.
            'image/png' => imagepng($canvas, $destination, $quality->pngEffort()),
            'image/gif' => imagegif($canvas, $destination),
            'image/webp' => imagewebp($canvas, $destination, $quality->lossy()),
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
