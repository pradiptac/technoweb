<?php

namespace App\Console\Commands;

use App\Jobs\IndexSearch;
use Illuminate\Console\Command;

/** Starts the nightly semantic search index (docs/semantic-search.md). The job slices itself. */
class IndexSearchCommand extends Command
{
    protected $signature = 'technoware:index-search';

    protected $description = 'Index every published record for search by meaning';

    public function handle(): int
    {
        IndexSearch::dispatch();

        return self::SUCCESS;
    }
}
