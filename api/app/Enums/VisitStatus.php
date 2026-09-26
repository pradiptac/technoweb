<?php

namespace App\Enums;

/**
 * Where an engineer visit request is.
 *
 * The `LeadStatus` shape: a PHP enum because this is a fixed lifecycle the
 * application branches on — the reminder reads `Confirmed`, the queue reads
 * `openStates()` — not a list the client adds to.
 *
 * A **reschedule is not a state**. The desk moving a confirmed visit to a new
 * time leaves it `Confirmed` and writes an event; a customer asking for new
 * times sends it back to `Requested`, because the desk now has to choose
 * again and the queue is how the desk finds out.
 */
enum VisitStatus: string
{
    case Requested = 'requested';
    case Confirmed = 'confirmed';
    case Completed = 'completed';
    case Cancelled = 'cancelled';
    case NoShow = 'no_show';

    public function label(): string
    {
        return match ($this) {
            self::Requested => 'Requested',
            self::Confirmed => 'Confirmed',
            self::Completed => 'Completed',
            self::Cancelled => 'Cancelled',
            self::NoShow => 'No-show',
        };
    }

    /** Still to happen. What "there is something to do" means on this queue. */
    public static function openStates(): array
    {
        return [self::Requested, self::Confirmed];
    }

    public function isOpen(): bool
    {
        return in_array($this, self::openStates(), true);
    }

    /**
     * Permitted moves, by the desk.
     *
     * `Confirmed` is reached only through the confirm endpoint, which is what
     * sets a time — a status select offering "Confirmed" would make a
     * confirmed visit with no appointment, the one state the reminder and the
     * calendar attachment cannot read. So it is absent from every list here.
     *
     * `Completed` and `NoShow` are what happened at a confirmed visit, and
     * either may be corrected to the other — a mis-click on a terminal state
     * with no way back is a figure somebody fixes in the database. A cancelled
     * visit may be reopened to `Requested`: a customer who cancelled and rang
     * back the next day is the same request, and a second one would lose the
     * trail.
     */
    public function canTransitionTo(self $next): bool
    {
        return in_array($next, match ($this) {
            self::Requested => [self::Cancelled],
            self::Confirmed => [self::Requested, self::Completed, self::NoShow, self::Cancelled],
            self::Completed => [self::NoShow],
            self::NoShow => [self::Completed],
            self::Cancelled => [self::Requested],
        }, true);
    }

    /**
     * Where this visit may go next, itself first — a dropdown is a promise,
     * the rule `LeadStatus::allowedNext()` argues.
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
