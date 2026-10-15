<?php

namespace App\Support\Events;

use App\Enums\EventRegistrationStatus;
use App\Enums\PublishStatus;
use App\Models\EventRegistration;
use App\Notifications\EventReminder;
use App\Support\Notifier;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;

/**
 * The reminder before an event: who is due one, and sending it once.
 *
 * Due means a **confirmed** registration, not yet reminded, for a
 * **published** event that starts within the next `event_reminder_hours` —
 * a window rather than "tomorrow", so a run every fifteen minutes reminds
 * each registrant about that long ahead whatever time the event is at.
 * Somebody confirmed inside the window has `reminded_at` stamped by the
 * confirmation itself (`EventActions`), which is what stops a reminder
 * landing a quarter of an hour after "you are registered".
 *
 * `event_reminder_hours` of **0 sends no reminder**: nobody is due.
 *
 * Transactional, so there is no quiet-hours gate — the visits' rule.
 * Nothing on the waiting list is reminded: there is nothing to turn up to.
 */
final class EventReminders
{
    public const BATCH = 200;

    /** @return Builder<EventRegistration> */
    public static function due(?Carbon $now = null): Builder
    {
        $now ??= now();
        $hours = EventSettings::reminderHours();

        $query = EventRegistration::query()
            ->where('status', EventRegistrationStatus::Confirmed)
            ->whereNull('reminded_at');

        if ($hours === 0) {
            // An answer, not a missing setting: nobody is due.
            return $query->whereRaw('1 = 0');
        }

        // A range on the start, so the events index is usable — never
        // `whereDate` (CLAUDE.md).
        return $query->whereHas('event', fn (Builder $q) => $q
            ->where('status', PublishStatus::Published)
            ->whereBetween('starts_at', [$now, $now->copy()->addHours($hours)]));
    }

    /**
     * Claimed with a conditional UPDATE before anything is sent — the
     * `VisitReminders::send()` pattern: two overlapping runs cannot both
     * win, and nobody is reminded twice. Through the query builder, so
     * `updated_at` does not move.
     */
    public static function send(EventRegistration $registration): bool
    {
        $claimed = EventRegistration::whereKey($registration->id)
            ->where('status', EventRegistrationStatus::Confirmed)
            ->whereNull('reminded_at')
            ->toBase()
            ->update(['reminded_at' => now()]);

        if ($claimed !== 1) {
            return false;
        }

        $registration->reminded_at = now();
        $registration->loadMissing('event');

        Notifier::to($registration->email, new EventReminder($registration));

        return true;
    }
}
