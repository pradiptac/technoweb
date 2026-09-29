<?php

namespace App\Console\Commands;

use App\Support\Meetings\MeetingReminders;
use Illuminate\Console\Command;

/**
 * Reminds customers before an online meeting, once per offset in Settings.
 *
 * Scheduled every five minutes. Everything it decides is in
 * `MeetingReminders`; this is the loop.
 */
class RemindMeetings extends Command
{
    protected $signature = 'technoware:remind-meetings';

    protected $description = 'Send the reminders owed before online meetings';

    public function handle(): int
    {
        $sent = MeetingReminders::run();

        $this->info("Sent {$sent} meeting reminder(s).");

        return self::SUCCESS;
    }
}
