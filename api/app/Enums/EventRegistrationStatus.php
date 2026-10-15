<?php

namespace App\Enums;

/**
 * Where one registration for an event is.
 *
 * The `VisitStatus` shape: a PHP enum because this is a fixed lifecycle the
 * application branches on — capacity counts `Confirmed`, the promotion walk
 * reads `Waitlisted`, the reminder reads `Confirmed` — not a list the client
 * adds to.
 *
 * `Attended` and `NoShow` are what happened on the day, so neither can be
 * reached before the event has started; that rule needs the event and lives
 * in `EventActions::move()`, not here.
 */
enum EventRegistrationStatus: string
{
    case Confirmed = 'confirmed';
    case Waitlisted = 'waitlisted';
    case Cancelled = 'cancelled';
    case Attended = 'attended';
    case NoShow = 'no_show';

    public function label(): string
    {
        return match ($this) {
            self::Confirmed => 'Confirmed',
            self::Waitlisted => 'On the waiting list',
            self::Cancelled => 'Cancelled',
            self::Attended => 'Attended',
            self::NoShow => 'No-show',
        };
    }

    /**
     * Holds seats against the capacity. `Attended` and `NoShow` held one
     * until the day, so they still count: a walk-in added afterwards must
     * not read a hall as emptier than it was.
     */
    public function holdsSeat(): bool
    {
        return in_array($this, [self::Confirmed, self::Attended, self::NoShow], true);
    }

    /** Still to happen: what the registrant may cancel, and what a repeat registration updates. */
    public function isActive(): bool
    {
        return in_array($this, [self::Confirmed, self::Waitlisted], true);
    }

    /** What happened on the day. A repeat registration no longer changes it. */
    public function isSettled(): bool
    {
        return in_array($this, [self::Attended, self::NoShow], true);
    }

    /**
     * Permitted moves, by the desk.
     *
     * A confirmed registration cannot be put *back* on the waiting list —
     * that is a cancellation with a promise attached, and the desk should
     * cancel it and say so. The two outcomes correct to each other and back
     * to `Confirmed`, because a mis-click on a terminal state with no way
     * back is a figure somebody fixes in the database.
     */
    public function canTransitionTo(self $next): bool
    {
        return in_array($next, match ($this) {
            self::Confirmed => [self::Cancelled, self::Attended, self::NoShow],
            self::Waitlisted => [self::Confirmed, self::Cancelled],
            self::Cancelled => [self::Confirmed, self::Waitlisted],
            self::Attended => [self::NoShow, self::Confirmed],
            self::NoShow => [self::Attended, self::Confirmed],
        }, true);
    }

    /**
     * Where a registration in this state may go **now**, itself first — a
     * dropdown is a promise, the rule `LeadStatus::allowedNext()` argues, so
     * the console offers only what a `PATCH` will accept.
     *
     * "Now" is whether the event has started: `Attended` and `NoShow` are
     * offered only once it has, which is the same clock
     * `EventActions::move()` refuses them by. What this cannot promise is
     * room — confirming a waiting party is still held to the capacity, and
     * that refusal names the seats.
     *
     * @return array<int, array{value: string, label: string}>
     */
    public function allowedNext(bool $started): array
    {
        $next = array_filter(
            self::cases(),
            fn (self $c) => $this->canTransitionTo($c) && ($started || ! $c->isSettled()),
        );

        return array_map(
            fn (self $c) => ['value' => $c->value, 'label' => $c->label()],
            [$this, ...array_values($next)],
        );
    }

    /** @return array<int, self> */
    public static function seatHolding(): array
    {
        return array_values(array_filter(self::cases(), fn (self $c) => $c->holdsSeat()));
    }

    /** @return array<int, array{value: string, label: string}> */
    public static function options(): array
    {
        return array_map(fn (self $c) => ['value' => $c->value, 'label' => $c->label()], self::cases());
    }
}
