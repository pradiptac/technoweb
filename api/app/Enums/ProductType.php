<?php

namespace App\Enums;

/**
 * What a product *is*, which decides how it is fulfilled.
 *
 * A PHP enum rather than a lookup table, the rule `TicketStatus` set: these are
 * two fixed branches the application takes — one reserves stock and waits for
 * somebody to put a box on a courier, the other assigns an activation code
 * inside the transaction that records the payment. A third row in a table could
 * not introduce a third fulfilment path without code, so a table would only be
 * a way of writing a value nothing knows how to handle.
 */
enum ProductType: string
{
    case Physical = 'physical';
    case Digital = 'digital';

    /*
     * The third one the brief did not list and this business needs.
     *
     * Hosting, an SSL certificate, an AMC visit: nothing to ship and no code to
     * issue, but somebody has to do something. Folding it into `digital` would
     * make the digital-code inventory the fulfilment path for a thing that has
     * no codes, and the order would sit for ever waiting for one.
     */
    case Service = 'service';

    public function label(): string
    {
        return match ($this) {
            self::Physical => 'Physical',
            self::Digital => 'Digital',
            self::Service => 'Service',
        };
    }

    public function description(): string
    {
        return match ($this) {
            self::Physical => 'Shipped to the customer. Stock is counted and dispatch is entered by hand.',
            self::Digital => 'Delivered as an activation code from inventory, immediately after payment.',
            self::Service => 'Work somebody does. Nothing to ship and no code to issue; fulfilled by hand.',
        };
    }

    /** Whether an order containing this needs an address and a courier. */
    public function isShipped(): bool
    {
        return $this === self::Physical;
    }

    /** Whether fulfilment means handing over an activation code. */
    public function needsCode(): bool
    {
        return $this === self::Digital;
    }

    /** @return array<int, array<string, string>> For the console's select. */
    public static function options(): array
    {
        return array_map(
            fn (self $c) => ['value' => $c->value, 'label' => $c->label(), 'description' => $c->description()],
            self::cases(),
        );
    }
}
