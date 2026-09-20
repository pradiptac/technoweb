<?php

namespace App\Support\Media;

use App\Models\Media;
use App\Support\SvgSanitiser;
use App\Support\UploadLimits;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * The write path an upload takes to the public disk, in one place.
 *
 * `MediaController::store()` carried this inline at 152 lines — the SVG
 * sanitising, the resolution ceiling, the hashed path and the row — beside
 * its own validation. The rules are unchanged; they are here so the
 * controller is routing and so the same sanitising is one call for
 * `replace()`, which had a second copy.
 */
class MediaUploader
{
    /**
     * What the library accepts, as one list.
     *
     * Stated once and used twice — by the upload rule and by the console's
     * info panel — because a screen telling an editor which formats are
     * allowed, from a second list, is a screen that lies the first time
     * somebody widens one of them.
     *
     * Still an allowlist rather than "anything not executable": these land on
     * the public disk and are served straight back to browsers, so the
     * question is what is safe to hand a visitor, not what is safe to store.
     *
     * **SVG is the one entry here a browser treats as a document.** It is
     * accepted — vector is the format logos and icons arrive in — and it goes
     * through `SvgSanitiser` before it is written: the same boundary
     * `HtmlSanitiser` draws for a CMS body, sanitise on write, at the sink.
     *
     * `zip` is here deliberately. A browser downloads it rather than running
     * it, and a bundle of datasheets is a real thing an editor publishes. It
     * is *not* the same call as the careers form, which refuses archives
     * because that upload is open to the internet; this one is behind a
     * content-manager session.
     */
    public const ALLOWED_EXTENSIONS = [
        'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg',
        'mp4', 'webm',
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'zip',
    ];

    public const VIDEO_EXTENSIONS = ['mp4', 'webm'];

    /**
     * Store a validated upload and return its row.
     *
     * @param  array{folder_id?: int|null, alt_text?: string|null}  $attributes
     */
    public static function store(UploadedFile $file, ?int $userId, array $attributes = []): Media
    {
        /*
         * Sanitised before it is stored, never after.
         *
         * The gap between writing a file to a public disk and cleaning it up
         * is a gap in which the URL is live and fetchable. This closes it by
         * never opening it: the bytes that reach the disk are already the
         * sanitised ones.
         */
        $svg = self::isSvg($file) ? self::cleanSvg($file) : null;

        if ($svg === null) {
            self::refuseOversizedRaster($file);
        }

        // Hashed name on a dated path: the original filename is metadata only,
        // so a crafted name cannot influence where the file lands.
        $path = $svg === null
            ? $file->store('media/'.now()->format('Y/m'), 'public')
            : self::putSanitisedSvg($svg);

        // getimagesize only understands raster formats; SVG has no intrinsic
        // pixel size, so both stay null rather than being guessed at.
        [$width, $height] = @getimagesize($file->getRealPath()) ?: [null, null];

        return Media::create([
            'uploaded_by' => $userId,
            'folder_id' => $attributes['folder_id'] ?? null,
            'disk' => 'public',
            'path' => $path,
            'filename' => $file->getClientOriginalName(),
            'mime' => $file->getClientMimeType(),
            'size' => $file->getSize(),
            'width' => $width,
            'height' => $height,
            'alt_text' => $attributes['alt_text'] ?? null,
        ]);
    }

    /**
     * The detected type as well as the name.
     *
     * `mimes:` already refuses a mismatch between the two, so an SVG named
     * `.png` never reaches here — but the check that decides whether to
     * sanitise should not be the client's filename alone. Asking both means
     * a future change to the allowlist cannot quietly create a spelling that
     * skips this.
     */
    public static function isSvg(UploadedFile $file): bool
    {
        return strtolower($file->getClientOriginalExtension()) === 'svg'
            || str_contains((string) $file->getMimeType(), 'svg');
    }

    /**
     * The sanitised markup, or a 422: a file the parser cannot read is refused
     * rather than repaired — there is no safe reading of markup nothing agrees
     * on how to parse.
     */
    public static function cleanSvg(UploadedFile $file): string
    {
        $clean = SvgSanitiser::clean((string) file_get_contents($file->getRealPath()));

        if ($clean === null) {
            throw ValidationException::withMessages([
                'file' => 'That SVG could not be read as valid XML, so nothing can check it for anything a browser would run.',
            ]);
        }

        return $clean;
    }

    /**
     * Resolution is checked before anything is written.
     *
     * `getimagesize` reads the header only — it does not decode the image,
     * which is the entire point: decoding is the expensive step this is
     * protecting. A well-compressed 12000x9000 JPEG sits inside the size
     * limit and costs GD roughly 4 bytes per pixel once opened, which is past
     * `memory_limit` and ends the request with a fatal error rather than a
     * message anybody can act on.
     *
     * Refused rather than downscaled: silently shrinking somebody's original
     * is a decision about their file that they did not make, and the resize
     * tools are right there.
     */
    private static function refuseOversizedRaster(UploadedFile $file): void
    {
        [$width, $height] = @getimagesize($file->getRealPath()) ?: [null, null];

        if (! $width || ! $height) {
            return;
        }

        $megapixels = ($width * $height) / 1_000_000;
        $max = UploadLimits::maxMegapixels();

        if ($megapixels > $max) {
            throw ValidationException::withMessages([
                'file' => sprintf(
                    'That image is %s x %s (%.1f megapixels), over the %s megapixel limit. '
                    .'Scale it down before uploading.',
                    $width, $height, $megapixels, rtrim(rtrim(number_format($max, 1), '0'), '.'),
                ),
            ]);
        }
    }

    /**
     * Written through Storage rather than `$file->store()`, because the bytes
     * going to disk are the sanitised markup and not the uploaded file — the
     * latter would put the original on the public disk verbatim, which is
     * exactly the file being refused. The name is generated the way Laravel
     * generates one, so nothing downstream can tell the two paths apart.
     */
    private static function putSanitisedSvg(string $svg): string
    {
        $path = 'media/'.now()->format('Y/m').'/'.Str::random(40).'.svg';

        Storage::disk('public')->put($path, $svg);

        return $path;
    }
}
