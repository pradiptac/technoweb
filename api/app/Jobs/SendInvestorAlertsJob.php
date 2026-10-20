<?php

namespace App\Jobs;

use App\Support\Presets\InvestorAlerts;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;

/**
 * The sweep, dispatched after an investor document is saved so one published
 * now is announced within the minute rather than at the next ten-minute run
 * (docs/content-presets.md).
 */
class SendInvestorAlertsJob implements ShouldBeUnique, ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $uniqueFor = 60;

    public function handle(): void
    {
        InvestorAlerts::due()->get()->each(fn ($entry) => InvestorAlerts::send($entry));
    }
}
