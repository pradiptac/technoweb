<?php

namespace App\Support\Meetings;

use App\Models\Meeting;
use App\Support\Ics;
use App\Support\Mail\MailBrand;
use Illuminate\Notifications\Messages\MailMessage;

/**
 * Our own calendar file for a meeting — sent only when Google is not the
 * one putting it into the customer's calendar (not connected, or failed for
 * good; see `MeetingNotices`).
 *
 * The UID is the reference, so a move updates the event the first file
 * made and a cancellation (`STATUS:CANCELLED`, a higher SEQUENCE) removes
 * it. It goes to the customer alone, so unlike the Google event it may
 * carry the manage link with its token.
 */
final class MeetingIcs
{
    public static function for(Meeting $meeting, bool $cancelled = false): string
    {
        $meeting->loadMissing('meetingType');
        $type = MeetingText::typeName($meeting);

        $description = 'Reference '.$meeting->reference.'. With '.MeetingText::hostName($meeting).'.';
        $description .= filled($meeting->meet_url)
            ? ' Join on Google Meet: '.$meeting->meet_url.'.'
            : ' We will send the link to join before the meeting.';
        $description .= ' To cancel or choose another time: '.$meeting->manageUrl();

        return Ics::event(
            uid: $meeting->reference,
            seq: Ics::sequence($meeting->updated_at, $cancelled),
            start: $meeting->starts_at,
            end: $meeting->ends_at,
            summary: $type.' — '.MailBrand::name(),
            description: $description,
            url: filled($meeting->meet_url) ? (string) $meeting->meet_url : $meeting->publicUrl(),
            cancelled: $cancelled,
            location: filled($meeting->meet_url) ? (string) $meeting->meet_url : null,
            product: 'Meetings',
        );
    }

    /** Attach the file to a message — the built-in one, so an edited wording keeps it. */
    public static function attach(MailMessage $message, Meeting $meeting, bool $cancelled = false): MailMessage
    {
        return $message->attachData(self::for($meeting, $cancelled), $meeting->reference.'.ics', [
            'mime' => 'text/calendar; charset=utf-8; method=PUBLISH',
        ]);
    }
}
