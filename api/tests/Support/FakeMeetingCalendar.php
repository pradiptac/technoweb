<?php

namespace Tests\Support;

use App\Enums\MeetingGoogleStatus;
use App\Events\MeetingSynced;
use App\Models\Meeting;
use App\Support\Meetings\MeetingCalendar;
use Carbon\CarbonInterface;

/**
 * A calendar made of arrays, so the booking rules can be tested without
 * Google (docs/meetings.md).
 *
 * Bind it in the container (`$this->app->instance(MeetingCalendar::class,
 * $fake)`). `busy` is what `busy()` answers — an address mapped to a list of
 * `[from, to]` pairs, or to null for a calendar Google would not show.
 * `outcome` is what the next `sync()` does to the meeting: `synced` (an
 * event with a Meet link), `synced_no_link`, or `failed` (one more attempt,
 * with an error). Every sync is recorded and dispatches `MeetingSynced`,
 * which is the contract with the real implementation.
 */
class FakeMeetingCalendar implements MeetingCalendar
{
    public bool $connected = true;

    /** @var array<string, list<array{0: CarbonInterface, 1: CarbonInterface}>|null> */
    public array $busy = [];

    public string $outcome = 'synced';

    /** @var list<string> the references synced, in order */
    public array $synced = [];

    /** @var list<array{0: list<string>, 1: CarbonInterface, 2: CarbonInterface}> */
    public array $busyCalls = [];

    public function connected(): bool
    {
        return $this->connected;
    }

    public function sync(Meeting $meeting): void
    {
        $this->synced[] = $meeting->reference;
        $before = $meeting->google_status;
        $previous = $meeting->meet_url;

        match ($this->outcome) {
            'synced' => $meeting->forceFill([
                'google_status' => MeetingGoogleStatus::Synced,
                'google_event_id' => $meeting->google_event_id ?? 'evt'.$meeting->id,
                'meet_url' => $meeting->meet_url ?? 'https://meet.google.com/abc-defg-'.$meeting->id,
                'google_error' => null,
            ])->saveQuietly(),
            'synced_no_link' => $meeting->forceFill([
                'google_status' => MeetingGoogleStatus::Synced,
                'google_event_id' => $meeting->google_event_id ?? 'evt'.$meeting->id,
            ])->saveQuietly(),
            default => $meeting->forceFill([
                'google_status' => MeetingGoogleStatus::Failed,
                'google_attempts' => $meeting->google_attempts + 1,
                'google_error' => 'Backend Error',
            ])->saveQuietly(),
        };

        MeetingSynced::dispatch($meeting, $before, $previous);
    }

    public function busy(array $emails, CarbonInterface $from, CarbonInterface $to): array
    {
        $this->busyCalls[] = [$emails, $from, $to];
        $out = [];

        foreach ($emails as $email) {
            $out[$email] = array_key_exists($email, $this->busy) ? $this->busy[$email] : [];
        }

        return $out;
    }
}
