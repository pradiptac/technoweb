<?php

namespace App\Support\Import;

use App\Models\ContentType;
use App\Models\Page;
use App\Models\Redirect;
use App\Support\ReservedSlugs;

/**
 * The redirect writer both imports share: a 301 from each old path to its new
 * one, never over an address this site serves itself, chains shortened.
 */
final class Redirects
{
    /**
     * @param  array<string, string>  $pairs  old path => new path
     * @param  callable(string, bool): void  $counted  called with the old path and whether the row is new
     * @param  ?callable(string): bool  $live  whether this site serves the address itself (default `live()`)
     */
    public static function write(array $pairs, callable $counted, ?callable $skip = null, ?callable $live = null): void
    {
        foreach ($pairs as $from => $to) {
            if ($from === $to || ($skip !== null && $skip($from)) || ($live ?? self::live(...))($from)) {
                continue;
            }

            $from = mb_substr($from, 0, 255);

            // Anything already pointing at the old address now points at the new one.
            Redirect::query()->where('to_path', $from)->update(['to_path' => $to]);

            $redirect = Redirect::query()->updateOrCreate(
                ['from_path' => $from],
                ['to_path' => $to, 'status_code' => 301, 'is_active' => true, 'created_automatically' => true],
            );

            $counted($from, $redirect->wasRecentlyCreated);
        }

        Redirect::query()->whereColumn('from_path', 'to_path')->delete();
    }

    /** Whether an old path collides with something this site serves itself. */
    public static function live(string $path): bool
    {
        $first = explode('/', ltrim($path, '/'))[0];

        return ReservedSlugs::reserved($first)
            || ($first === ltrim($path, '/') && Page::query()->where('slug', $first)->exists())
            || ContentType::query()->where('slug', $first)->exists() && substr_count($path, '/') === 1;
    }
}
