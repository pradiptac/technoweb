<?php

namespace App\Enums;

/**
 * Whether Google Calendar matches the meeting (docs/meetings.md, "Google").
 *
 * `Pending` and `Failed` are what the minute sweeper
 * (`technoware:sync-meetings`) picks up, under the retry cap; `Synced` is an
 * event that says what the row says; `Off` is a meeting Google is not part
 * of — no account connected when it was booked, or an event made under an
 * account or calendar that is no longer the connected one, where the `.ics`
 * path takes over.
 *
 * A Google failure never fails or undoes a booking: this column is the only
 * place it shows.
 */
enum MeetingGoogleStatus: string
{
    case Pending = 'pending';
    case Synced = 'synced';
    case Failed = 'failed';
    case Off = 'off';

    public function label(): string
    {
        return match ($this) {
            self::Pending => 'Waiting to sync',
            self::Synced => 'In Google Calendar',
            self::Failed => 'Sync failed',
            self::Off => 'Not in Google Calendar',
        };
    }

    /** What the sweeper retries. */
    public static function retryable(): array
    {
        return [self::Pending, self::Failed];
    }

    /** @return array<int, array{value: string, label: string}> */
    public static function options(): array
    {
        return array_map(fn (self $c) => ['value' => $c->value, 'label' => $c->label()], self::cases());
    }
}
