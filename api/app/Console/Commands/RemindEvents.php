<?php

namespace App\Console\Commands;

use App\Models\EventRegistration;
use App\Support\Events\EventReminders;
use Illuminate\Console\Command;

/**
 * Reminds confirmed registrants before an event, once each.
 *
 * Scheduled every fifteen minutes. Everything it decides is in
 * `EventReminders`; this is the loop.
 */
class RemindEvents extends Command
{
    protected $signature = 'technoware:remind-events';

    protected $description = 'Email a reminder to confirmed registrants of events that start soon';

    public function handle(): int
    {
        $sent = 0;

        EventReminders::due()
            ->with('event')
            ->orderBy('id')
            ->limit(EventReminders::BATCH)
            ->get()
            ->each(function (EventRegistration $registration) use (&$sent) {
                if (EventReminders::send($registration)) {
                    $sent++;
                }
            });

        $this->info("Sent {$sent} event reminder(s).");

        return self::SUCCESS;
    }
}
