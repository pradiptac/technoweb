<?php

namespace App\Support\Events;

use App\Enums\EventRegistrationMode;
use App\Models\Event;
use Carbon\CarbonInterface;

/**
 * Whether somebody may register for an event right now — **the one
 * definition** of open, full, waiting list, closed and ended.
 *
 * Three things ask this question and must not give three answers: the
 * availability endpoint the registration panel reads after mount, the
 * register endpoint when the form is posted, and the console's counts. So
 * they all build one of these, from the event and its `EventCounts`.
 *
 * The order of the checks is the order of the reasons a person would be
 * given: an event that does not register here at all; one that has already
 * begun; one whose registration has closed; then the room.
 *
 * - `ended` is "the event has **started**", not "is over". Once the doors
 *   are open there is nobody to send a confirmation to in time.
 * - `waitlist` is "full, and the waiting list is on" — **and also** "seats
 *   are free but somebody is already waiting". The second case is a party of
 *   three at the head of the queue with two seats free: a newcomer joins
 *   behind them rather than taking the two, or the list is not a queue.
 * - `full` exists only without a waiting list.
 *
 * **No count leaves here for the public site.** `fewLeft` is one bit: a
 * capacity is set and a fifth of it or less, but at least one seat, remains.
 */
final class Availability
{
    public const NONE = 'none';

    public const EXTERNAL = 'external';

    public const OPEN = 'open';

    public const WAITLIST = 'waitlist';

    public const FULL = 'full';

    public const CLOSED = 'closed';

    public const ENDED = 'ended';

    private function __construct(
        public readonly string $state,
        /** Seats free; null when there is no capacity, or the question does not arise. */
        public readonly ?int $seatsLeft,
        public readonly bool $fewLeft,
        private readonly bool $over,
    ) {}

    public static function for(Event $event, ?EventCounts $counts = null, ?CarbonInterface $now = null): self
    {
        $now ??= now();

        if ($event->registration_mode === EventRegistrationMode::None) {
            return new self(self::NONE, null, false, false);
        }

        if ($event->registration_mode === EventRegistrationMode::External) {
            return new self(self::EXTERNAL, null, false, false);
        }

        if ($event->hasStarted($now)) {
            return new self(self::ENDED, null, false, $event->isPast($now));
        }

        if ($event->registration_closes_at !== null && $event->registration_closes_at->lte($now)) {
            return new self(self::CLOSED, null, false, false);
        }

        if ($event->capacity === null) {
            return new self(self::OPEN, null, false, false);
        }

        $counts ??= $event->registrationCounts();
        $left = max(0, $event->capacity - $counts->heldSeats);
        $queue = $event->waitlist_enabled && $counts->waitlisted > 0;

        if ($left >= 1 && ! $queue) {
            // A fifth or less of the room, in whole seats: 8 of 40, never 1 of 4.
            return new self(self::OPEN, $left, $left * 5 <= $event->capacity, false);
        }

        return new self($event->waitlist_enabled ? self::WAITLIST : self::FULL, $left, false, false);
    }

    /** A state in which a new registration is turned away outright. */
    public function refuses(): bool
    {
        return in_array($this->state, [self::NONE, self::EXTERNAL, self::FULL, self::CLOSED, self::ENDED], true);
    }

    /** The sentence for a state that refuses; null for one that does not. */
    public function message(): ?string
    {
        return match ($this->state) {
            self::FULL => 'This event is full.',
            self::CLOSED => 'Registration for this event has closed.',
            self::ENDED => $this->over
                ? 'This event has taken place.'
                : 'This event has already started, so registration has closed.',
            default => null,
        };
    }

    /** What a 422 on `registration` says — the same sentence, plus the two modes that never register here. */
    public function refusal(): string
    {
        return $this->message() ?? 'This event does not take registrations here.';
    }

    /**
     * The availability endpoint's `data`.
     *
     * @return array{state: string, few_left: bool, message: string|null}
     */
    public function toArray(): array
    {
        return [
            'state' => $this->state,
            'few_left' => $this->fewLeft,
            'message' => $this->message(),
        ];
    }
}
