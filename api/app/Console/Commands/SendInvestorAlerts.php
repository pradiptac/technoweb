<?php

namespace App\Console\Commands;

use App\Support\Presets\InvestorAlerts;
use Illuminate\Console\Command;

/**
 * Emails the investor list about documents that have gone live with "Email
 * subscribers when published" on (docs/content-presets.md). Every ten
 * minutes, which is what catches a document scheduled for a later date: it
 * goes live without anybody saving it.
 */
class SendInvestorAlerts extends Command
{
    protected $signature = 'technoware:send-investor-alerts';

    protected $description = 'Email the investor list about investor documents that have just gone live.';

    public function handle(): int
    {
        InvestorAlerts::due()->get()->each(fn ($entry) => InvestorAlerts::send($entry));

        return self::SUCCESS;
    }
}
