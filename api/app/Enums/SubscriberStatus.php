<?php

namespace App\Enums;

/**
 * Where a subscriber stands.
 *
 * Four states rather than a boolean, for the reason `CustomerStatus` gives:
 * "switched off" and "asked not to be mailed" want opposite words in front of
 * whoever is reading, and only one of them may ever be undone by an import.
 */
enum SubscriberStatus: string
{
    case Active = 'active';
    case Unsubscribed = 'unsubscribed';
    case Bounced = 'bounced';
    case Suppressed = 'suppressed';

    public function label(): string
    {
        return match ($this) {
            self::Active => 'Active',
            self::Unsubscribed => 'Unsubscribed',
            self::Bounced => 'Bounced',
            self::Suppressed => 'Suppressed',
        };
    }

    /** Only one of these may be sent to, and every path asks here. */
    public function canReceive(): bool
    {
        return $this === self::Active;
    }

    public static function options(): array
    {
        return array_map(fn (self $c) => ['value' => $c->value, 'label' => $c->label()], self::cases());
    }
}
