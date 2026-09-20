<?php

namespace App\Enums;

/**
 * Why a stock level changed.
 *
 * Three cases, because three things move stock in this application and nothing
 * else does. **Direction is not one of them** — `delta` carries the sign, so a
 * `Sale` is always out and an `Adjustment` is whichever way somebody typed.
 * Naming a `restock` and a `write_off` separately would be the application
 * guessing at intent it was never told: an editor changing 4 to 40 has not
 * said whether a delivery arrived or a miscount was corrected.
 *
 * There is deliberately no `Cancellation` or `Return`. **Nothing in this
 * product puts stock back** — cancelling an order does not restore it and
 * neither does a refund — so a case for it would be a promise the code does
 * not keep, and a filter offering it would return nothing for ever. When
 * restocking on cancellation is built, this is where it starts.
 */
enum StockMovementReason: string
{
    /** An order was paid and `Settlement::takeStock()` took it. */
    case Sale = 'sale';

    /** Somebody typed a different number into the product form. */
    case Adjustment = 'adjustment';

    /** The level a product was created with. */
    case Initial = 'initial';

    public function label(): string
    {
        return match ($this) {
            self::Sale => 'Sale',
            self::Adjustment => 'Adjustment',
            self::Initial => 'Opening stock',
        };
    }

    /**
     * What this reason means, for the console's filter.
     *
     * The API sends these rather than the console listing them, the rule
     * `schema_type_options` and `meta.transitions` follow: one list of strings
     * with nothing type-checking a second copy of it across the wire.
     *
     * @return array<int, array<string, string>>
     */
    public static function options(): array
    {
        return array_map(fn (self $case) => [
            'value' => $case->value,
            'label' => $case->label(),
        ], self::cases());
    }
}
