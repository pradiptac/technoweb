<?php

namespace App\Jobs;

use App\Support\Search\SearchFile;
use Illuminate\Contracts\Queue\ShouldBeUniqueUntilProcessing;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Rebuilds the search file (docs/semantic-search.md). One waits at a time;
 * the lock lets go when it starts, so a change made while it builds queues
 * the next. A lost lock lapses after ten minutes.
 */
class RebuildSearchFile implements ShouldBeUniqueUntilProcessing, ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    public int $uniqueFor = 600;

    public function handle(): void
    {
        SearchFile::rebuild();
    }
}
