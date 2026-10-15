<?php

namespace App\Support\Events;

use App\Enums\EventRegistrationStatus;
use App\Models\Event;
use App\Models\EventRegistration;

/**
 * How many people are coming to an event, and how many seats that is.
 *
 * **Capacity is counted in seats, never in registrations** — one
 * registration may be a party of four. `heldSeats` is the figure capacity is
 * compared with: the confirmed seats, plus the seats of anybody since marked
 * attended or no-show, who held one until the day. Before an event starts
 * the two are the same number, because neither outcome can be recorded yet.
 *
 * Read with one grouped query — for a page of events as well as for one —
 * and never published: the public site is told a state and whether few are
 * left (`Availability`), not a figure.
 */
final class EventCounts
{
    public function __construct(
        public readonly int $confirmed = 0,
        public readonly int $confirmedSeats = 0,
        public readonly int $waitlisted = 0,
        public readonly int $cancelled = 0,
        public readonly int $attended = 0,
        public readonly int $heldSeats = 0,
        public readonly ?int $capacity = null,
    ) {}

    /** Seats still free, never below zero; null when the event has no capacity. */
    public function seatsLeft(): ?int
    {
        return $this->capacity === null ? null : max(0, $this->capacity - $this->heldSeats);
    }

    /**
     * The `counts` block of the admin resource.
     *
     * @return array{confirmed: int, confirmed_seats: int, waitlisted: int, cancelled: int, attended: int, seats_left: int|null}
     */
    public function toArray(): array
    {
        return [
            'confirmed' => $this->confirmed,
            'confirmed_seats' => $this->confirmedSeats,
            'waitlisted' => $this->waitlisted,
            'cancelled' => $this->cancelled,
            'attended' => $this->attended,
            'seats_left' => $this->seatsLeft(),
        ];
    }

    /** One event, read now. */
    public static function for(Event $event): self
    {
        return self::build(self::rows([$event->id])[$event->id] ?? [], $event->capacity);
    }

    /**
     * A page of events in one query, each given its counts for the request.
     *
     * @param  iterable<int, Event>  $events
     */
    public static function load(iterable $events): void
    {
        $byId = [];

        foreach ($events as $event) {
            $byId[$event->id] = $event;
        }

        if ($byId === []) {
            return;
        }

        $rows = self::rows(array_keys($byId));

        foreach ($byId as $id => $event) {
            $event->setRegistrationCounts(self::build($rows[$id] ?? [], $event->capacity));
        }
    }

    /**
     * Registrations and seats by status, per event.
     *
     * @param  array<int, int>  $eventIds
     * @return array<int, array<string, array{registrations: int, seats: int}>>
     */
    private static function rows(array $eventIds): array
    {
        $out = [];

        $rows = EventRegistration::query()
            ->whereIn('event_id', $eventIds)
            ->toBase()
            ->selectRaw('event_id, status, COUNT(*) AS registrations, COALESCE(SUM(seats), 0) AS seats')
            ->groupBy('event_id', 'status')
            ->get();

        foreach ($rows as $row) {
            $out[(int) $row->event_id][(string) $row->status] = [
                'registrations' => (int) $row->registrations,
                'seats' => (int) $row->seats,
            ];
        }

        return $out;
    }

    /** @param  array<string, array{registrations: int, seats: int}>  $rows */
    private static function build(array $rows, ?int $capacity): self
    {
        $registrations = fn (EventRegistrationStatus $s) => $rows[$s->value]['registrations'] ?? 0;
        $seats = fn (EventRegistrationStatus $s) => $rows[$s->value]['seats'] ?? 0;

        return new self(
            confirmed: $registrations(EventRegistrationStatus::Confirmed),
            confirmedSeats: $seats(EventRegistrationStatus::Confirmed),
            waitlisted: $registrations(EventRegistrationStatus::Waitlisted),
            cancelled: $registrations(EventRegistrationStatus::Cancelled),
            attended: $registrations(EventRegistrationStatus::Attended),
            heldSeats: array_sum(array_map($seats, EventRegistrationStatus::seatHolding())),
            capacity: $capacity,
        );
    }
}
