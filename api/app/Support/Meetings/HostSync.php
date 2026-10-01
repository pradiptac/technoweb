<?php

namespace App\Support\Meetings;

use App\Enums\MeetingGoogleStatus;
use App\Models\Meeting;
use App\Models\User;

/**
 * A host's account changed in a way Google has to hear about.
 *
 * Their invitation is addressed to the email on their account, so a new
 * address has to reach every event still to come — or Google goes on
 * inviting a mailbox that may no longer be theirs. Each future scheduled
 * meeting Google is part of goes back to `pending` with its attempts reset,
 * and the minute sweeper (`technoware:sync-meetings`) PATCHes the attendee
 * list: nothing waits on Google inside the request that saved the account,
 * and a staff member with forty meetings is forty calls on the scheduler
 * rather than on somebody's Save button.
 */
final class HostSync
{
    public static function emailChanged(User $user): int
    {
        return Meeting::query()
            ->upcoming()
            ->where('host_id', $user->id)
            ->where('google_status', '!=', MeetingGoogleStatus::Off->value)
            ->update([
                'google_status' => MeetingGoogleStatus::Pending->value,
                'google_attempts' => 0,
            ]);
    }
}
