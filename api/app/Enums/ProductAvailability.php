<?php

namespace App\Enums;

/**
 * Whether a product can be had, in schema.org's own vocabulary.
 *
 * The values are `InStock`, `BackOrder` and the rest rather than friendlier
 * words, because a translation table between "we can get it" and `BackOrder` is
 * a second place for the mapping to go wrong — and the mapping is the entire
 * job. `label()` and `blurb()` do the explaining in the admin form, which is
 * where an editor needs it.
 *
 * Deliberately a short list. Schema.org defines nine of these and most describe
 * situations a hardware supplier without an online checkout will never be in:
 * `SoldOut` and `PreOrder` are event and launch vocabulary, `InStoreOnly` and
 * `OnlineOnly` describe a sales channel this catalogue does not have. Offering
 * an editor nine options where four apply is how the wrong one gets picked.
 */
enum ProductAvailability: string
{
    case InStock = 'InStock';
    case BackOrder = 'BackOrder';
    case LimitedAvailability = 'LimitedAvailability';
    case Discontinued = 'Discontinued';

    public function label(): string
    {
        return match ($this) {
            self::InStock => 'In stock',
            self::BackOrder => 'Supplied to order',
            self::LimitedAvailability => 'Limited availability',
            self::Discontinued => 'Discontinued',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::InStock => 'Held here, or reliably available within a normal lead time.',
            self::BackOrder => 'Ordered in when somebody asks. The usual answer for a catalogue line.',
            self::LimitedAvailability => 'Allocation is tight — worth saying so before somebody plans around it.',
            self::Discontinued => 'No longer supplied. Keep the page for the people still running one.',
        };
    }

    /** @return array<int, string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
