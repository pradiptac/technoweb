<?php

namespace App\Enums;

/**
 * What state a thing is sold in, in Google's vocabulary rather than ours.
 *
 * The values are `new`, `refurbished` and `used` because those are the three
 * strings Merchant Center accepts, and a translation table between "ex-demo"
 * and `refurbished` is a second place for the mapping to go wrong — the same
 * reasoning `ProductAvailability` gives for holding schema.org's own spellings.
 * `label()` and `blurb()` do the explaining in the console, which is where
 * somebody needs it.
 *
 * Three cases, not more. Google's list is exactly these three, so there is no
 * shorter list to curate down to and no longer one to be tempted by.
 */
enum ProductCondition: string
{
    case New = 'new';
    case Refurbished = 'refurbished';
    case Used = 'used';

    public function label(): string
    {
        return match ($this) {
            self::New => 'New',
            self::Refurbished => 'Refurbished',
            self::Used => 'Used',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::New => 'Unopened, as it left the manufacturer. The ordinary answer.',
            self::Refurbished => 'Restored to working order and sold as such — ex-demo, returned, or repaired.',
            self::Used => 'Second-hand. Say so before somebody pays, not on the receipt.',
        };
    }

    /**
     * What the schema.org Offer wants, which is not what the feed wants.
     *
     * Two vocabularies for one fact: the feed takes `new`, the markup takes
     * `https://schema.org/NewCondition`. Both are derived here so they cannot
     * drift into two answers about one product.
     */
    public function schemaUrl(): string
    {
        return 'https://schema.org/'.match ($this) {
            self::New => 'NewCondition',
            self::Refurbished => 'RefurbishedCondition',
            self::Used => 'UsedCondition',
        };
    }

    /** @return array<int, string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    /** @return array<int, array{value: string, label: string, blurb: string}> */
    public static function options(): array
    {
        return array_map(fn (self $c) => [
            'value' => $c->value,
            'label' => $c->label(),
            'blurb' => $c->blurb(),
        ], self::cases());
    }
}
