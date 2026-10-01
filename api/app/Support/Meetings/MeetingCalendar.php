<?php

namespace App\Support\Meetings;

use App\Models\Meeting;
use Carbon\CarbonInterface;

/**
 * The company calendar every meeting is organised on (docs/meetings.md,
 * "Google Calendar").
 *
 * An interface so the booking rules, the slot engine and the sync job never
 * name Google: the container binds `NullMeetingCalendar` until the Google
 * implementation replaces it, and a test binds a fake here to prove a rule
 * that is not about HTTP.
 */
interface MeetingCalendar
{
    /** Whether an account is connected and can be written to. */
    public function connected(): bool;

    /**
     * Make the calendar match the meeting's current state: create the event
     * for a scheduled meeting that has none, move it (time and the whole
     * attendee list) for one that changed, delete it for a cancelled one.
     *
     * Idempotent — running it twice leaves one event — and it writes what
     * happened onto the meeting (`google_status`, `google_event_id`,
     * `meet_url`, `google_error`). It never throws for a refusal from the
     * calendar: a Google failure never fails or undoes a booking.
     */
    public function sync(Meeting $meeting): void;

    /**
     * Busy times for each address across a range, for the slot engine.
     *
     * Each address maps to a list of `[from, to]` pairs in the app's
     * timezone, or to **null** when its calendar could not be read (not
     * shared, outside the domain, the call failed) — unknown, which never
     * blocks a slot. An address absent from the answer is unknown too.
     *
     * @param  list<string>  $emails
     * @return array<string, list<array{0: CarbonInterface, 1: CarbonInterface}>|null>
     */
    public function busy(array $emails, CarbonInterface $from, CarbonInterface $to): array;
}
