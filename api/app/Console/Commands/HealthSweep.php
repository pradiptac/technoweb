<?php

namespace App\Console\Commands;

use App\Jobs\SweepHealth;
use Illuminate\Console\Command;

/** Starts the nightly site health sweep (docs/health.md). The job slices itself. */
class HealthSweep extends Command
{
    protected $signature = 'technoware:health-sweep';

    protected $description = 'Re-check every record for the site health centre';

    public function handle(): int
    {
        SweepHealth::dispatch();

        return self::SUCCESS;
    }
}
