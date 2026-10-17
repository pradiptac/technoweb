<?php

namespace App\Support\Search;

use Illuminate\Support\Facades\Cache;

/** The packed file a search reads (docs/semantic-search.md). Filled out in the next task. */
final class SearchFile
{
    public const STALE_KEY = 'search:file-stale';

    public static function markStale(): void
    {
        Cache::forever(self::STALE_KEY, true);
    }
}
