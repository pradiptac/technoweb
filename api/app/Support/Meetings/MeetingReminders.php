<?php

namespace App\Support\Meetings;

use App\Enums\MeetingStatus;
use App\Models\Meeting;
use App\Models\MeetingReminder;
use Illuminate\Support\Carbon;

/**
 * The reminders before a meeting — one per offset in Settings, a day and an
 * hour before by default (docs/meetings.md, "Reminders").
 *
 * **Due** means: the meeting is scheduled, has not started, and `starts_at −
 * offset` has passed, with no row yet for `(meeting, offset, starts_at)`.
 * **Claimed by inserting the row**: the unique key makes two overlapping
 * runs unable to both send one reminder, and a moved meeting — a new
 * `starts_at` — owes fresh rows without anything being deleted.
 *
 * An offset already past when the meeting is booked (or moved) is written
 * sent at once (`seedPast()`), so a meeting booked for this afternoon is not
 * sent a "starts in 24 hours" a minute later. When a missed run leaves two
 * offsets due at once, both are claimed and **one** reminder goes — the
 * nearer, which is the one that is still true.
 *
 * Transactional: no quiet hours. Somebody with a call at nine wants the
 * reminder even if it is due at eleven the night before.
 */
final class MeetingReminders
{
    public const BATCH = 200;

    /** Mark every offset already past as sent, so none of them arrives late. */
    public static function seedPast(Meeting $meeting): void
    {
        if ($meeting->status !== MeetingStatus::Scheduled) {
            return;
        }

        $now = now();
        $rows = [];

        foreach (MeetingSettings::reminderOffsets() as $offset) {
            if ($meeting->starts_at->copy()->subMinutes($offset)->lte($now)) {
                $rows[] = self::row($meeting, $offset, $now);
            }
        }

        if ($rows !== []) {
            MeetingReminder::query()->insertOrIgnore($rows);
        }
    }

    /** One pass: every meeting owed a reminder now. Returns how many were sent. */
    public static function run(?Carbon $now = null): int
    {
        $now ??= now();
        $offsets = MeetingSettings::reminderOffsets();

        if ($offsets === []) {
            return 0;
        }

        $sent = 0;

        Meeting::query()
            ->with('meetingType')
            ->where('status', MeetingStatus::Scheduled->value)
            ->where('starts_at', '>', $now)
            ->where('starts_at', '<=', $now->copy()->addMinutes(max($offsets)))
            ->orderBy('starts_at')
            ->limit(self::BATCH)
            ->get()
            ->each(function (Meeting $meeting) use ($offsets, $now, &$sent) {
                if (self::send($meeting, $offsets, $now)) {
                    $sent++;
                }
            });

        return $sent;
    }

    /** @param  list<int>  $offsets */
    private static function send(Meeting $meeting, array $offsets, Carbon $now): bool
    {
        $claimed = [];

        foreach ($offsets as $offset) {
            if ($meeting->starts_at->copy()->subMinutes($offset)->gt($now)) {
                continue;
            }

            if (MeetingReminder::query()->insertOrIgnore([self::row($meeting, $offset, null)]) === 1) {
                $claimed[] = $offset;
            }
        }

        if ($claimed === []) {
            return false;
        }

        MeetingNotices::remind($meeting);

        MeetingReminder::query()
            ->where('meeting_id', $meeting->id)
            ->whereIn('offset_minutes', $claimed)
            ->where('starts_at', $meeting->getRawOriginal('starts_at'))
            ->update(['sent_at' => $now, 'updated_at' => $now]);

        $meeting->record(MeetingNotices::REMINDED, note: 'Reminder sent: it starts '.MeetingText::startsIn($meeting, $now).'.');

        return true;
    }

    /** @return array<string, mixed> */
    private static function row(Meeting $meeting, int $offset, ?Carbon $sentAt): array
    {
        $now = now();

        return [
            'meeting_id' => $meeting->id,
            'offset_minutes' => $offset,
            // The stored string, so the unique key compares like for like.
            'starts_at' => $meeting->getRawOriginal('starts_at') ?? $meeting->fromDateTime($meeting->starts_at),
            'sent_at' => $sentAt,
            'created_at' => $now,
            'updated_at' => $now,
        ];
    }
}
