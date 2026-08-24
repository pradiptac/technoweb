<?php

namespace App\Support;

use App\Models\Media;

/**
 * Alt text for an image, looked up by its stored path.
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
 * place that has to change.
 *
 * The alt lives with the file rather than with each use of it. Strictly, alt
 * text describes an image *in context*, and the same photograph can warrant
 * different wording on a product page and in an article. For a hardware
 * catalogue — where the answer is almost always the name of the thing in the
 * picture — one description per file is worth far more than four sets of
 * fields nobody fills in. A per-use override can be added later without
 * changing what this returns.
 */
class MediaAlt
{
    /** @var array<string,string>|null */
    private static ?array $map = null;

    public static function for(?string $path): ?string
    {
        if ($path === null || $path === '') {
            return null;
        }

        return self::map()[$path] ?? null;
    }

    /**
     * @param  array<int,string>|null  $paths
     * @return array<int,string|null>
     */
    public static function forEach(?array $paths): array
    {
        return collect($paths ?? [])->map(fn ($p) => self::for($p))->all();
    }

    /** @return array<string,string> */
    private static function map(): array
    {
        if (self::$map === null) {
            self::$map = Media::query()
                ->whereNotNull('alt_text')
                ->where('alt_text', '!=', '')
                ->pluck('alt_text', 'path')
                ->all();
        }

        return self::$map;
    }

    /** Tests build media inside a single process; the cache has to be droppable. */
    public static function forget(): void
    {
        self::$map = null;
    }
}
