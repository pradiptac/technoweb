<?php

namespace App\Support;

use App\Models\Setting;

/**
 * How large an upload may be, and who actually decides.
 *
 * Three ceilings apply to every upload and the smallest one wins, which is the
 * whole reason this class exists:
 *
 * 1. **The setting**, in the console. What the business wants.
 * 2. **`upload_max_filesize`**, in php.ini. PHP discards a larger file before
 *    any application code runs.
 * 3. **`post_max_size`**, also php.ini. Larger and PHP throws away the *entire*
 *    request body — so Laravel sees no file at all and validation says the
 *    field is required, which is a confusing lie about what went wrong.
 *
 * A setting above either PHP value therefore does nothing except break
 * uploads in a way nobody can diagnose from the console: the screen says 20MB,
 * the server keeps refusing at 2MB, and the two never mention each other. So
 * the effective limit is a **minimum**, and `/admin/settings` shows what PHP
 * allows next to what was chosen.
 *
 * There is a fourth ceiling that is not here: Next's Server Action body limit,
 * in `web/next.config.ts`. It cannot be read from PHP, and it is a build-time
 * constant on the other side of the wire — the console states it as a fixed
 * fact rather than pretending to measure it.
 */
class UploadLimits
{
    /** What the seeder ships, and the fallback if the row is missing. */
    public const DEFAULT_KB = 5120;

    public const DEFAULT_VIDEO_KB = 20480;

    /**
     * Megapixels, not bytes.
     *
     * A well-compressed 12000x9000 JPEG can sit inside a 5MB limit and still
     * cost GD roughly 4 bytes per pixel once decoded — over 400MB for one
     * resize, which is past the shipped `memory_limit` and takes the request
     * out with a fatal error rather than a message. Size and resolution are
     * different limits because they constrain different resources: the
     * transfer and the decode.
     *
     * 50 is generous — a 50MP image is larger than any current full-frame
     * camera produces — so it refuses the pathological case without being a
     * limit real photography meets.
     */
    public const DEFAULT_MAX_MEGAPIXELS = 50;

    /**
     * The limit to validate against, in kilobytes.
     *
     * Clamped to what PHP will actually accept. Returning the raw setting
     * would put a number in the error message that the server itself cannot
     * honour.
     */
    public static function maxKb(bool $video = false): int
    {
        $wanted = $video
            ? (int) Setting::get('media_max_video_kb', self::DEFAULT_VIDEO_KB)
            : (int) Setting::get('media_max_kb', self::DEFAULT_KB);

        // A blank or nonsensical setting falls back rather than making every
        // upload fail — the same rule the mail transport and `?sort=` follow.
        if ($wanted < 1) {
            $wanted = $video ? self::DEFAULT_VIDEO_KB : self::DEFAULT_KB;
        }

        return min($wanted, self::phpCeilingKb());
    }

    /**
     * The largest file PHP will accept, whatever the console says.
     *
     * `post_max_size` has to hold the file *and* the rest of the multipart
     * body, so it is the binding one in practice — but taking the minimum of
     * both is what makes this true regardless of how the two are configured.
     */
    public static function phpCeilingKb(): int
    {
        return min(self::uploadMaxKb(), self::postMaxKb());
    }

    public static function uploadMaxKb(): int
    {
        return self::toKb((string) ini_get('upload_max_filesize'));
    }

    public static function postMaxKb(): int
    {
        return self::toKb((string) ini_get('post_max_size'));
    }

    /** The resolution ceiling, in megapixels. */
    public static function maxMegapixels(): float
    {
        $wanted = (float) Setting::get('media_max_megapixels', self::DEFAULT_MAX_MEGAPIXELS);

        return $wanted > 0 ? $wanted : self::DEFAULT_MAX_MEGAPIXELS;
    }

    /**
     * Everything the console needs to explain the situation.
     *
     * @return array{
     *     max_kb:int, max_video_kb:int,
     *     php_upload_max_kb:int, php_post_max_kb:int, php_ceiling_kb:int,
     *     max_megapixels:float, capped:bool, video_capped:bool
     * }
     */
    public static function describe(): array
    {
        $ceiling = self::phpCeilingKb();
        $wanted = (int) Setting::get('media_max_kb', self::DEFAULT_KB);
        $wantedVideo = (int) Setting::get('media_max_video_kb', self::DEFAULT_VIDEO_KB);

        return [
            'max_kb' => self::maxKb(),
            'max_video_kb' => self::maxKb(true),
            'php_upload_max_kb' => self::uploadMaxKb(),
            'php_post_max_kb' => self::postMaxKb(),
            'php_ceiling_kb' => $ceiling,
            'max_megapixels' => self::maxMegapixels(),
            // Whether the chosen number is the one in force, or PHP is
            // quietly overruling it. This is the fact the console exists to
            // surface.
            'capped' => $wanted > $ceiling,
            'video_capped' => $wantedVideo > $ceiling,
        ];
    }

    /**
     * php.ini shorthand to kilobytes.
     *
     * The values are written as `2M`, `512K`, `2G` or a plain byte count, and
     * the suffix is a *binary* multiplier — `2M` is 2048K, not 2000K. An
     * absent or unlimited value (`-1`, `0`, empty) means no ceiling from that
     * direction, which is expressed as PHP_INT_MAX so `min()` ignores it
     * rather than clamping everything to zero.
     */
    private static function toKb(string $value): int
    {
        $value = trim($value);

        if ($value === '' || $value === '-1' || $value === '0') {
            return PHP_INT_MAX;
        }

        $unit = strtolower(substr($value, -1));
        $number = (float) $value;

        $bytes = match ($unit) {
            'g' => $number * 1024 * 1024 * 1024,
            'm' => $number * 1024 * 1024,
            'k' => $number * 1024,
            default => $number,
        };

        return (int) max(1, floor($bytes / 1024));
    }
}
