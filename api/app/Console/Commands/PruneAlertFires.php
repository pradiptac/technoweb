<?php

namespace App\Console\Commands;

use App\Models\AlertFire;
use Illuminate\Console\Command;

/** Nightly (docs/digest-alerts.md). An open fire is kept however old: it is what stops a repeat. */
class PruneAlertFires extends Command
{
    protected $signature = 'technoware:prune-alert-fires';

    protected $description = 'Delete alert records that cleared more than 30 days ago';

    public function handle(): int
    {
        $n = AlertFire::query()->whereNotNull('cleared_at')->where('cleared_at', '<', now()->subDays(30))->delete();
        $this->info("{$n} deleted.");

        return self::SUCCESS;
    }
}
