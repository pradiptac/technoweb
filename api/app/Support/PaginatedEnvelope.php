<?php

namespace App\Support;

use Illuminate\Contracts\Pagination\LengthAwarePaginator;

/**
 * The `{data, links, meta}` envelope every other list endpoint here answers
 * with, for the three that build their own.
 *
 * Those three transformed the collection by hand rather than through a
 * Resource, and returned `$rows->toArray() + ['meta' => [...]]`. That reads as
 * "the paginator's array, plus some extra meta" and is not what it does:
 * `LengthAwarePaginator::toArray()` puts `current_page`, `last_page`,
 * `per_page` and `total` at the **top level**, so the added `meta` key was the
 * only `meta` in the response and carried nothing but the extras. The console
 * reads `meta.current_page` and `meta.total` like it does everywhere else, got
 * `undefined`, and printed **"Showing NaN–NaN of"** with an empty per-page
 * control — on the JavaScript errors screen, the blog comment queue and the
 * unsubscribe list alike.
 *
 * One helper rather than the same six lines three times: the reason those
 * three screens broke identically is that the envelope was written out three
 * times, and a fourth hand-rolled one would break the same way again.
 */
class PaginatedEnvelope
{
    /**
     * @param  array<string, mixed>  $meta  Extras to merge alongside the paginator's own.
     * @return array<string, mixed>
     */
    public static function from(LengthAwarePaginator $rows, array $meta = []): array
    {
        $page = $rows->toArray();

        return [
            'data' => $page['data'],
            'links' => [
                'first' => $page['first_page_url'] ?? null,
                'last' => $page['last_page_url'] ?? null,
                'prev' => $page['prev_page_url'] ?? null,
                'next' => $page['next_page_url'] ?? null,
            ],
            /*
             * The paginator's four first, so a caller's extras cannot
             * accidentally redefine what `total` means to the pager — which is
             * the filtered count of this query, not a count of the table.
             */
            'meta' => [
                'current_page' => $page['current_page'],
                'last_page' => $page['last_page'],
                'per_page' => (int) $page['per_page'],
                'total' => $page['total'],
            ] + $meta,
        ];
    }
}
