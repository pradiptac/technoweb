<?php

namespace App\Listeners;

use App\Events\MeetingSynced;
use App\Support\Meetings\MeetingNotices;
use Illuminate\Support\Facades\Log;

/**
 * The end of a calendar sync decides what the customer is sent: the
 * confirmation with the Meet link, our `.ics` and "the link will follow",
 * or the link once it has arrived — and whether the desk is told Google
 * gave up. The rules are `MeetingNotices::afterSync()`.
 *
 * Found by event discovery (app/Listeners). Synchronous on purpose: it runs
 * inside the sync job, which is already off the request path, and a
 * second queue hop would only delay the email.
 */
class SendMeetingConfirmation
{
    public function handle(MeetingSynced $event): void
    {
        try {
            MeetingNotices::afterSync($event->meeting, $event->before, $event->previousMeetUrl);
        } catch (\Throwable $e) {
            // The sync has already written its outcome; a notice that could
            // not be sent must not make the job look failed.
            Log::warning('A meeting notice after a calendar sync failed', [
                'meeting' => $event->meeting->reference,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
