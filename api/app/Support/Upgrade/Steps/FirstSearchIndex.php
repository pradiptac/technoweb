<?php

namespace App\Support\Upgrade\Steps;

use App\Jobs\IndexSearch;
use App\Support\Search\SemanticSettings;
use App\Support\Upgrade\UpgradeStep;

/**
 * Search by meaning (0.182.0, docs/semantic-search.md) is off until somebody
 * switches it on, so an update has nothing to index unless it already is; the
 * settings screen queues the first index itself when it is switched on.
 */
final class FirstSearchIndex implements UpgradeStep
{
    public function id(): string
    {
        return '2026-10-23-first-search-index';
    }

    public function version(): string
    {
        return '0.182.0';
    }

    public function description(): string
    {
        return 'Index every page for search by meaning';
    }

    public function run(): void
    {
        if (SemanticSettings::enabled()) {
            IndexSearch::dispatch();
        }
    }
}
