<?php

namespace App\Enums;

/**
 * Where an online meeting is (2026-09-29, docs/meetings.md).
 *
 * The `VisitStatus` shape, and shorter: a meeting is booked into a free slot
 * with a host at the moment it is made, so there is no "requested" state to
 * wait in. A **reschedule is not a state** — a moved meeting stays
 * `Scheduled` and the trail records the move.
 *
 * Nothing becomes `NoShow` by itself: a meeting still scheduled after its end
 * is "needs an outcome", a filter, until somebody says what happened.
 */
enum MeetingStatus: string
{
    case Scheduled = 'scheduled';
    case Completed = 'completed';
    case NoShow = 'no_show';
    case Cancelled = 'cancelled';

    public function label(): string
    {
        return match ($this) {
            self::Scheduled => 'Scheduled',
            self::Completed => 'Completed',
            self::NoShow => 'No-show',
            self::Cancelled => 'Cancelled',
        };
    }

    /** Still to happen, or still owed an outcome. */
    public static function openStates(): array
    {
        return [self::Scheduled];
    }

    public function isOpen(): bool
    {
        return in_array($this, self::openStates(), true);
    }

    /**
     * Permitted moves.
     *
     * `Completed` and `NoShow` are what happened, and either may be corrected
     * to the other — a mis-click on a terminal state with no way back is a
     * figure somebody fixes in the database. `Cancelled` is terminal: the
     * Google event is deleted and the slot released, so a cancelled meeting
     * that "comes back" is a new booking into whatever slot is free now.
     */
    public function canTransitionTo(self $next): bool
    {
        return in_array($next, match ($this) {
            self::Scheduled => [self::Completed, self::NoShow, self::Cancelled],
            self::Completed => [self::NoShow],
            self::NoShow => [self::Completed],
            self::Cancelled => [],
        }, true);
    }

    /**
     * Where this meeting may go next, itself first — a dropdown is a promise.
     *
     * @return array<int, array{value: string, label: string}>
     */
    public function allowedNext(): array
    {
        $next = array_values(array_filter(self::cases(), fn (self $c) => $c !== $this && $this->canTransitionTo($c)));

        return array_map(
            fn (self $c) => ['value' => $c->value, 'label' => $c->label()],
            [$this, ...$next],
        );
    }

    /** The options, for a console that must not hold its own copy of this list. */
    public static function options(): array
    {
        return array_map(fn (self $c) => [
            'value' => $c->value,
            'label' => $c->label(),
            'open' => $c->isOpen(),
        ], self::cases());
    }
}
