<?php

namespace App\Events;

use App\Enums\MeetingGoogleStatus;
use App\Models\Meeting;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * A sync with the company calendar has finished (docs/meetings.md, "Google
 * Calendar") — whatever it came to: an event made, moved or deleted, a Meet
 * link that arrived, a failure, or the meeting marked `off`.
 *
 * Dispatched at the end of every `MeetingCalendar::sync()`. The listener that
 * sends the customer's confirmation compares `$before` and
 * `$previousMeetUrl` with the meeting as it now is: pending → synced with a
 * link is the confirmation carrying the link, failed → synced is
 * "the link is ready", anything → off is the `.ics` path.
 */
class MeetingSynced
{
    use Dispatchable;

    public function __construct(
        public Meeting $meeting,
        public MeetingGoogleStatus $before,
        public ?string $previousMeetUrl,
    ) {}
}
