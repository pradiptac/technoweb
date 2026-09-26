<?php

namespace App\Support\Visits;

use App\Enums\MessageEvent;
use App\Enums\VisitStatus;
use App\Models\VisitRequest;
use App\Notifications\VisitReminder;
use App\Support\Notifier;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;

/**
 * The day-before reminder: which visits are due one, and sending it once.
 *
 * Due means confirmed, not yet reminded, and starting within the next
 * twenty-four hours — a window rather than "tomorrow", so a run every fifteen
 * minutes reminds each visit about a day ahead whatever time it is booked
 * for. A visit confirmed inside that window has `reminded_at` stamped by the
 * confirmation itself (`VisitActions::confirm()`), which is what stops a
 * reminder landing fifteen minutes after the booking.
 *
 * Transactional, so there is no quiet-hours gate: somebody expecting an
 * engineer at nine wants the reminder even if it is due at eleven at night.
 */
final class VisitReminders
{
    public const BATCH = 100;

    /** @return Builder<VisitRequest> */
    public static function due(?Carbon $now = null): Builder
    {
        $now ??= now();

        return VisitRequest::query()
            ->where('status', VisitStatus::Confirmed)
            ->whereNull('reminded_at')
            ->whereBetween('scheduled_start_at', [$now, $now->copy()->addDay()]);
    }

    /**
     * Claimed with a conditional UPDATE before anything is sent — the
     * `CartReminders::send()` pattern: two overlapping runs cannot both win,
     * and a visit is never reminded twice. Through the query builder, so
     * `updated_at` does not move.
     */
    public static function send(VisitRequest $visit): bool
    {
        $claimed = VisitRequest::whereKey($visit->id)
            ->where('status', VisitStatus::Confirmed)
            ->whereNull('reminded_at')
            ->toBase()
            ->update(['reminded_at' => now()]);

        if ($claimed !== 1) {
            return false;
        }

        $visit->reminded_at = now();
        $visit->record('reminded');

        Notifier::to($visit->email, new VisitReminder($visit));
        VisitText::notify(MessageEvent::VisitReminder, $visit);

        return true;
    }
}
