<?php

namespace App\Support\Store\Shipping;

use RuntimeException;

/**
 * Shiprocket said no, could not be reached, or answered 200 with an error
 * body (which it does often — see `Shiprocket::checked()`).
 *
 * The message is Shiprocket's own words where it gave any; it is shown to
 * staff on the order and on the settings screen, never to a customer.
 * `status` is the HTTP status (0 when nothing answered), and `unknown` marks
 * the one case a caller must not retry blindly: the request may have been
 * received and acted on even though no usable answer came back.
 */
final class ShiprocketRefused extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 0, public readonly bool $unknown = false, public readonly array $body = [])
    {
        parent::__construct($message);
    }

    /** The account itself is the problem: no retry helps until somebody fixes the sign-in. */
    public function isAuthorisation(): bool
    {
        return in_array($this->status, [401, 403], true);
    }
}
