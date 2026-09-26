<?php

namespace App\Console\Commands;

use App\Support\Visits\VisitReminders;
use Illuminate\Console\Command;

/**
 * Reminds customers the day before a confirmed engineer visit, once.
 *
 * Scheduled every fifteen minutes. Everything it decides is in
 * `VisitReminders`; this is the loop.
 */
class RemindVisits extends Command
{
    protected $signature = 'technoware:remind-visits';

    protected $description = 'Email a reminder about engineer visits in the next 24 hours';

    public function handle(): int
    {
        $sent = 0;

        VisitReminders::due()
            ->with(['service', 'solution'])
            ->orderBy('scheduled_start_at')
            ->limit(VisitReminders::BATCH)
            ->get()
            ->each(function ($visit) use (&$sent) {
                if (VisitReminders::send($visit)) {
                    $sent++;
                }
            });

        $this->info("Sent {$sent} visit reminder(s).");

        return self::SUCCESS;
    }
}
