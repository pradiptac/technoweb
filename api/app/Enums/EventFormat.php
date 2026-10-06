<?php

namespace App\Enums;

/**
 * How an event is attended (0.118.0, `docs/events.md`).
 *
 * It decides three things beyond the label: whether a venue is required
 * (`hasVenue()`), whether a join link is (`isOnline()`), and the
 * `eventAttendanceMode` the page's structured data declares.
 */
enum EventFormat: string
{
    case InPerson = 'in_person';
    case Online = 'online';
    case Hybrid = 'hybrid';

    public function label(): string
    {
        return match ($this) {
            self::InPerson => 'In person',
            self::Online => 'Online',
            self::Hybrid => 'In person and online',
        };
    }

    /** Somewhere to go: a venue is part of the event. */
    public function hasVenue(): bool
    {
        return $this !== self::Online;
    }

    /** Something to join: a link is part of the event. */
    public function isOnline(): bool
    {
        return $this !== self::InPerson;
    }

    /** The schema.org `eventAttendanceMode` this format is. */
    public function attendanceMode(): string
    {
        return 'https://schema.org/'.match ($this) {
            self::InPerson => 'OfflineEventAttendanceMode',
            self::Online => 'OnlineEventAttendanceMode',
            self::Hybrid => 'MixedEventAttendanceMode',
        };
    }

    /** @return array<int, array{value: string, label: string}> */
    public static function options(): array
    {
        return array_map(fn (self $c) => ['value' => $c->value, 'label' => $c->label()], self::cases());
    }
}
