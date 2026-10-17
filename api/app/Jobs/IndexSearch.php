<?php

namespace App\Jobs;

use App\Models\SearchQueryVector;
use App\Support\Search\Indexable;
use App\Support\Search\Indexer;
use App\Support\Search\SearchFile;
use App\Support\Search\SemanticSettings;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The nightly index of every record (docs/semantic-search.md), sliced like
 * the Site health sweep: a slice works for `$budgetSeconds` and dispatches the
 * next with its cursor. It catches what a save missed (`saveQuietly`, imports),
 * then embeds anything still waiting, prunes the query cache and marks the
 * search file stale so it is rebuilt.
 */
class IndexSearch implements ShouldQueue
{
    use Queueable;

    public const LAST_RUN_KEY = 'search:last_index_at';

    public int $tries = 1;

    public int $timeout = 80;

    /** Mutable for the slicing test only. */
    public static int $budgetSeconds = 40;

    public function __construct(public readonly int $kindIndex = 0, public readonly int $afterId = 0) {}

    public function handle(): void
    {
        if (! SemanticSettings::enabled()) {
            return;
        }

        $started = microtime(true);
        $aliases = Indexable::aliases();

        for ($k = $this->kindIndex; $k < count($aliases); $k++) {
            $class = Indexable::classFor($aliases[$k]);
            $after = $k === $this->kindIndex ? $this->afterId : 0;

            foreach ($class::query()->where('id', '>', $after)->orderBy('id')->lazyById(100) as $model) {
                try {
                    Indexer::index($model);
                } catch (Throwable $e) {
                    Log::warning('Semantic search: a record could not be indexed', ['type' => $aliases[$k], 'id' => $model->getKey(), 'error' => $e->getMessage()]);
                }

                if (microtime(true) - $started >= self::$budgetSeconds) {
                    self::dispatch($k, (int) $model->getKey());

                    return;
                }
            }
        }

        while (Indexer::embedWaiting() > 0 && microtime(true) - $started < max(self::$budgetSeconds, 1)) {
            // keep embedding until nothing waits or the slice is spent
        }

        SearchQueryVector::query()->where('last_used_at', '<', now()->subDays(30))->delete();
        SearchFile::markStale();
        Cache::forever(self::LAST_RUN_KEY, now()->toIso8601String());
    }
}
