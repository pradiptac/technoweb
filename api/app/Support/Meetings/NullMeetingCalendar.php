<?php

namespace App\Support\Meetings;

use App\Enums\MeetingGoogleStatus;
use App\Models\Meeting;
use Carbon\CarbonInterface;

/**
 * No calendar connected: nothing is written anywhere and nobody is busy.
 *
 * A meeting synced through this is marked `off`, which is what sends the
 * customer our own `.ics` instead of relying on a Google invitation. Bound
 * by `AppServiceProvider` until the Google implementation takes its place.
 */
final class NullMeetingCalendar implements MeetingCalendar
{
    public function connected(): bool
    {
        return false;
    }

    public function sync(Meeting $meeting): void
    {
        if ($meeting->google_status !== MeetingGoogleStatus::Off) {
            $meeting->forceFill(['google_status' => MeetingGoogleStatus::Off])->saveQuietly();
        }
    }

    public function busy(array $emails, CarbonInterface $from, CarbonInterface $to): array
    {
        // Unknown for everybody: an unreadable calendar never blocks a slot.
        return array_fill_keys($emails, null);
    }
}
