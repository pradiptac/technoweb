<?php

namespace App\Console\Commands;

use App\Support\Alerts\AlertCheck;
use Illuminate\Console\Command;

/** Every five minutes (docs/digest-alerts.md). */
class CheckAlerts extends Command
{
    protected $signature = 'technoware:check-alerts';

    protected $description = 'Tell staff, once, about what needs them now';

    public function handle(): int
    {
        $result = AlertCheck::run();
        $this->info("{$result['alerts']} new alerts for {$result['people']} people.");

        return self::SUCCESS;
    }
}
