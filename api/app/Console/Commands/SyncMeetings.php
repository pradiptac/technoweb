<?php

namespace App\Console\Commands;

use App\Enums\MeetingGoogleStatus;
use App\Enums\MeetingStatus;
use App\Models\Meeting;
use App\Support\Meetings\GoogleCalendar;
use App\Support\Meetings\MeetingCalendar;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Builder;

/**
 * The Google Calendar sweeper (docs/meetings.md, "Syncing"), every minute.
 *
 * Picks up what did not reach Google the first time — `pending` and
 * `failed`, under `GoogleCalendar::MAX_ATTEMPTS` — and scheduled meetings
 * whose event is made but whose Meet link was still pending. With no queue
 * worker the booking's own sync ran once inline; this is what retries it.
 *
 * Each meeting is claimed with a conditional UPDATE that bumps
 * `google_attempts` only where it still holds the value read, so two
 * overlapping runs cannot both sync one meeting, and the bump is what gives
 * a retried conference request a new request id. The attempt count is
 * reset by a sync that finishes the job.
 */
class SyncMeetings extends Command
{
    protected $signature = 'technoware:sync-meetings {--limit=20 : Meetings to sync in one run}';

    protected $description = 'Retry Google Calendar syncs for meetings that are pending, failed or still waiting for a Meet link';

    public function handle(MeetingCalendar $calendar): int
    {
        if (GoogleCalendar::backedOffUntil() !== null) {
            $this->info('Google asked us to slow down; waiting.');

            return self::SUCCESS;
        }

        if ($calendar instanceof GoogleCalendar) {
            $calendar->timeout(10);
        }

        $synced = 0;

        foreach (self::due()->orderBy('id')->limit(max(1, (int) $this->option('limit')))->get(['id', 'google_attempts']) as $row) {
            $claimed = Meeting::query()
                ->whereKey($row->id)
                ->where('google_attempts', $row->google_attempts)
                ->update(['google_attempts' => $row->google_attempts + 1]);

            if ($claimed !== 1) {
                continue;
            }

            $meeting = Meeting::query()->with(['meetingType', 'host'])->find($row->id);

            if ($meeting === null) {
                continue;
            }

            $calendar->sync($meeting);
            $synced++;

            // A rate limit part-way through: the rest wait for the next run.
            if (GoogleCalendar::backedOffUntil() !== null) {
                break;
            }
        }

        $this->info("Synced {$synced} meeting(s).");

        return self::SUCCESS;
    }

    /**
     * What the sweeper may claim. A meeting already over is left alone
     * unless it was cancelled — its event still has to go.
     *
     * @return Builder<Meeting>
     */
    public static function due(): Builder
    {
        return Meeting::query()
            ->where('google_attempts', '<', GoogleCalendar::MAX_ATTEMPTS)
            ->where(function (Builder $q) {
                $q->whereIn('google_status', array_map(fn (MeetingGoogleStatus $s) => $s->value, MeetingGoogleStatus::retryable()))
                    ->orWhere(fn (Builder $q) => $q
                        ->where('google_status', MeetingGoogleStatus::Synced->value)
                        ->where('status', MeetingStatus::Scheduled->value)
                        ->whereNull('meet_url')
                        ->whereNotNull('google_event_id'));
            })
            ->where(fn (Builder $q) => $q
                ->where('status', MeetingStatus::Cancelled->value)
                ->orWhere('ends_at', '>', now()));
    }
}
