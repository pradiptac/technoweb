<?php

namespace App\Support\Store;

use RuntimeException;

/**
 * The checkout found the address is not the one delivery was quoted for.
 *
 * Thrown inside the order's transaction and caught by `Checkout::place()`
 * just outside it: the new destination has to be *saved* on the basket, and a
 * save made inside the transaction that is then refused would be rolled back
 * with it. The message is the 422's text and carries the new figure.
 */
final class DestinationChanged extends RuntimeException
{
    public function __construct(public readonly string $stateCode, string $message)
    {
        parent::__construct($message);
    }
}
