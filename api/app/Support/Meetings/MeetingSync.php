<?php

namespace App\Support\Meetings;

use App\Enums\MeetingGoogleStatus;
use App\Jobs\SyncMeetingToGoogle;
use App\Models\Meeting;
use App\Support\QueueHealth;
use Illuminate\Support\Facades\Log;

/**
 * Hands a meeting to the company calendar after a change — a booking, a
 * move, a cancellation, a Retry (docs/meetings.md, "Syncing").
 *
 * Called **after the commit**, never inside the booking's transaction: a
 * Google call must not hold a host's row lock, and a Google failure never
 * fails or undoes a booking.
 *
 * Three cases:
 *
 *  - **No calendar connected** — or a meeting that has lived on the `.ics`
 *    path from the start (`off`, no event id): the meeting is marked `off`
 *    and the customer's confirmation, with our calendar file, goes at once.
 *    A meeting booked while nothing was connected stays on that path for
 *    good, even after an account is connected: Google inviting somebody who
 *    already holds our `.ics` would put the meeting in their calendar twice,
 *    under two UIDs.
 *  - **Something drains the queue** — the job is dispatched after commit.
 *  - **Nothing does** — the job runs inline, once, now; the minute sweeper
 *    retries whatever that leaves pending or failed.
 *
 * `MAX_ATTEMPTS` is the retry cap the sweeper and the confirmation listener
 * share: a meeting `failed` with that many attempts has failed **for good**,
 * which is when the desk is told and the customer is sent the `.ics`.
 */
final class MeetingSync
{
    public const MAX_ATTEMPTS = 5;

    public static function queue(Meeting $meeting): void
    {
        try {
            $calendar = app(MeetingCalendar::class);
            $icsOnly = $meeting->google_status === MeetingGoogleStatus::Off && blank($meeting->google_event_id);

            if (! $calendar->connected() || $icsOnly) {
                $before = $meeting->google_status;

                if ($before !== MeetingGoogleStatus::Off) {
                    $meeting->forceFill(['google_status' => MeetingGoogleStatus::Off])->saveQuietly();
                }

                MeetingNotices::afterSync($meeting, $before, $meeting->meet_url);

                return;
            }

            // A fresh change deserves fresh tries: a meeting that had given
            // up is picked up by the sweeper again.
            $meeting->forceFill([
                'google_status' => MeetingGoogleStatus::Pending,
                'google_attempts' => 0,
            ])->saveQuietly();

            if (config('queue.default') === 'sync' || QueueHealth::delivering()) {
                SyncMeetingToGoogle::dispatch($meeting->id)->afterCommit();

                return;
            }

            SyncMeetingToGoogle::dispatchSync($meeting->id);
        } catch (\Throwable $e) {
            // Warning, not info: `LOG_LEVEL=warning` ships in both .env files.
            Log::warning('A meeting could not be handed to the calendar; the sweeper will retry', [
                'meeting' => $meeting->reference,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
