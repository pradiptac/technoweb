<?php

namespace App\Jobs;

use App\Models\Meeting;
use App\Support\Meetings\MeetingCalendar;
use Illuminate\Contracts\Queue\ShouldBeUniqueUntilProcessing;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;

/**
 * Make the company calendar match one meeting as it is **now** — create,
 * move or delete its event (docs/meetings.md, "Syncing").
 *
 * It carries the meeting's id and nothing else, and reads the row when it
 * runs, so a job queued for a booking that was moved a second later syncs
 * the move. `MeetingCalendar::sync()` is idempotent — our own event id, a
 * 409 on insert read as success — so running it twice leaves one event.
 *
 * **Unique until processing starts, and never two at once**, both keyed on
 * the id. Unique-until-processing rather than until-processed: a second
 * change arriving while a sync is in flight must still queue a job, or the
 * in-flight one — which read the row before the change — would be the last
 * word. `WithoutOverlapping` then holds that second job until the first
 * has finished, so the two never race each other against Google.
 *
 * With nothing draining the queue, `MeetingSync` runs this inline once
 * after the commit; the minute sweeper (`technoware:sync-meetings`) retries
 * anything still pending or failed. A Google failure never fails or undoes
 * a booking: `sync()` records it on the row and does not throw.
 */
class SyncMeetingToGoogle implements ShouldBeUniqueUntilProcessing, ShouldQueue
{
    use Queueable;

    /**
     * Attempts include the releases `WithoutOverlapping` makes while another
     * sync of the same meeting runs. `sync()` itself never throws, so one
     * exception is the most any run should see.
     */
    public int $tries = 5;

    public int $maxExceptions = 1;

    public int $timeout = 60;

    /** How long the uniqueness lock may outlive a job that died holding it. */
    public int $uniqueFor = 300;

    public function __construct(public readonly int $meetingId) {}

    public function uniqueId(): string
    {
        return (string) $this->meetingId;
    }

    /** @return array<int, object> */
    public function middleware(): array
    {
        return [
            (new WithoutOverlapping('meeting-sync:'.$this->meetingId))
                ->releaseAfter(15)
                ->expireAfter(120),
        ];
    }

    public function handle(MeetingCalendar $calendar): void
    {
        $meeting = Meeting::query()->find($this->meetingId);

        if ($meeting === null) {
            return;
        }

        $calendar->sync($meeting);
    }
}
