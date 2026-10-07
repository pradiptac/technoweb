<?php

namespace App\Support;

use App\Models\Media;

/**
 * What the library knows about a picture, looked up by its stored path:
 * the alt text, and the focal point.
 *
 * Records hold a path, not a media id — `cover_image_path`, `images[]` — so
 * the path is the only thing linking a published image back to the library
 * row that describes it. That is also why this is a lookup rather than a
 * relation: adding one would mean a migration and a backfill for every
 * existing path, and the paths are already unique.
 *
 * The whole map is loaded once per request and memoised. A products index
 * renders twenty images; twenty queries for twenty short strings is worse
 * than one query for all of them, and the table is small enough that the
 * difference will hold for a long time. If it stops holding, this is the one
 * place that has to change. Only rows that say something are loaded — an
 * alt text, or a point — since the rest would be keys mapping to nothing.
 *
 * Both facts live with the file rather than with each use of it. Strictly,
 * alt text describes an image *in context*, and the same photograph can
 * warrant different wording on a product page and in an article. For a
 * hardware catalogue — where the answer is almost always the name of the
 * thing in the picture — one description per file is worth far more than
 * four sets of fields nobody fills in. The focal point is the same argument
 * from the other side: the subject of a photograph is where it is whichever
 * box crops it, so a 4:3 tile, a 16:9 hero and a 1:1 thumbnail all want the
 * same answer. A per-use override can be added later without changing what
 * this returns.
 *
 * `MediaAlt` until 2026-09-20, when the point joined the alt.
 */
class MediaMeta
{
    /** @var array<string, array{alt: string|null, focus: string|null}>|null */
    private static ?array $map = null;

    /** @var array<string, string>|null */
    private static ?array $blurs = null;

    public static function alt(?string $path): ?string
    {
        return self::row($path)['alt'] ?? null;
    }

    /**
     * @param  array<int,string>|null  $paths
     * @return array<int,string|null>
     */
    public static function alts(?array $paths): array
    {
        return collect($paths ?? [])->map(fn ($p) => self::alt($p))->all();
    }

    /**
     * The focal point as `object-position` wants it — `"30% 20%"` — or null
     * when none has been chosen. Null rather than `"50% 50%"`, so a caller
     * can tell "unset" from "chosen the centre" and set no style at all for
     * the first, which is what every picture rendered as before the point
     * existed.
     */
    public static function focus(?string $path): ?string
    {
        return self::row($path)['focus'] ?? null;
    }

    /**
     * @param  array<int,string>|null  $paths
     * @return array<int,string|null>
     */
    public static function focuses(?array $paths): array
    {
        return collect($paths ?? [])->map(fn ($p) => self::focus($p))->all();
    }

    /**
     * The picture's blurred preview — a small `data:` URL (0.123.0,
     * `App\Support\Media\Placeholder`) — or null when there is none: a
     * vector, a file with no library row, a row the backfill has not reached.
     * Published beside every `*_focus` as `*_blur`, and null rather than an
     * empty string so the frontend sets no placeholder at all.
     */
    public static function blur(?string $path): ?string
    {
        if ($path === null || $path === '') {
            return null;
        }

        return self::blurMap()[$path] ?? null;
    }

    /**
     * @param  array<int,string>|null  $paths
     * @return array<int,string|null>
     */
    public static function blurs(?array $paths): array
    {
        return collect($paths ?? [])->map(fn ($p) => self::blur($p))->all();
    }

    /**
     * The string the frontend puts in `object-position`, from the two columns.
     *
     * @return non-empty-string|null
     */
    public static function format(?int $x, ?int $y): ?string
    {
        if ($x === null || $y === null) {
            return null;
        }

        return "{$x}% {$y}%";
    }

    /** @return array{alt: string|null, focus: string|null}|null */
    private static function row(?string $path): ?array
    {
        if ($path === null || $path === '') {
            return null;
        }

        return self::map()[$path] ?? null;
    }

    /** @return array<string, array{alt: string|null, focus: string|null}> */
    private static function map(): array
    {
        if (self::$map === null) {
            self::$map = Media::query()
                ->where(function ($q) {
                    $q->where(fn ($alt) => $alt->whereNotNull('alt_text')->where('alt_text', '!=', ''))
                        ->orWhereNotNull('focal_x');
                })
                ->get(['path', 'alt_text', 'focal_x', 'focal_y'])
                ->mapWithKeys(fn (Media $m) => [$m->path => [
                    'alt' => filled($m->alt_text) ? $m->alt_text : null,
                    'focus' => self::format($m->focal_x, $m->focal_y),
                ]])
                ->all();
        }

        return self::$map;
    }

    /**
     * A map of its own, loaded the first time a preview is asked for.
     *
     * Nearly every picture has one, where few have an alt text or a point —
     * folded into `map()` it would load the whole library on every request
     * that reads an alt text, the console's included. Through the query
     * builder, not the model: two columns for a few thousand rows, and
     * hydrating a model for each is most of what such a read costs.
     *
     * @return array<string, string>
     */
    private static function blurMap(): array
    {
        if (self::$blurs === null) {
            self::$blurs = Media::query()->toBase()
                ->whereNull('deleted_at')
                ->whereNotNull('blur')->where('blur', '!=', '')
                ->pluck('blur', 'path')
                ->all();
        }

        return self::$blurs;
    }

    /** Tests build media inside a single process; the cache has to be droppable. */
    public static function forget(): void
    {
        self::$map = null;
        self::$blurs = null;
    }
}
