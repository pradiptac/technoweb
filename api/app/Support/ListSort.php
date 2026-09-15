<?php

namespace App\Support;

use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

/**
 * `?sort=` and `?dir=` for a console list, from an allowlist.
 *
 * Each list names the columns a header may sort by — a key on the wire to a
 * column, or to a closure for an ordering that is not a column (priority is
 * a FIELD() over four words). An unrecognised key falls back to the list's
 * own default ordering rather than answering 422, the rule `?sort=` on the
 * catalogue follows: a sort parameter arrives from a bookmark or a stale tab,
 * and an error page is the worse answer. `dir` is `asc` or `desc` and
 * anything else reads as the column's natural direction.
 *
 * Every ordering ends on `id`, so a page boundary cannot show one row twice
 * and hide another — the media library's rule, which applies to every table
 * where two rows can share a value in the sorted column, which is all of them.
 */
final class ListSort
{
    /**
     * @param  array<string, string|Closure(Builder, string): mixed>  $columns
     * @param  Closure(Builder): mixed  $default
     */
    public static function apply(Builder $query, Request $request, array $columns, Closure $default): Builder
    {
        $key = $request->string('sort')->value();
        $dir = strtolower($request->string('dir')->value()) === 'asc' ? 'asc' : 'desc';

        if ($key === '' || ! array_key_exists($key, $columns)) {
            $default($query);
        } else {
            $column = $columns[$key];
            $column instanceof Closure ? $column($query, $dir) : $query->orderBy($column, $dir);
        }

        return $query->orderBy($query->getModel()->getQualifiedKeyName(), $dir);
    }

    /** What a list may sort by, for `meta` — so the console offers what the API takes. */
    public static function keys(array $columns): array
    {
        return array_keys($columns);
    }
}
