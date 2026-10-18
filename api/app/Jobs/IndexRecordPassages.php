<?php

namespace App\Jobs;

use App\Support\Search\Indexable;
use App\Support\Search\Indexer;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/** Re-indexes one record after it is saved (docs/semantic-search.md). A record gone since is forgotten. */
class IndexRecordPassages implements ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    public function __construct(public readonly string $alias, public readonly int $id) {}

    public function handle(): void
    {
        $class = Indexable::classFor($this->alias);
        $model = $class ? $class::find($this->id) : null;

        $model === null ? Indexer::forget($this->alias, $this->id) : Indexer::index($model);
    }
}
