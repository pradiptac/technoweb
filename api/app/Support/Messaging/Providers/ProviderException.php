<?php

namespace App\Support\Messaging\Providers;

use Illuminate\Http\Client\Response;
use RuntimeException;

/**
 * A provider refused, in its own words.
 *
 * `revoke` means the address is dead for good and the contact is opted out
 * (FCM's `UNREGISTERED`); `config` means the credentials are wrong (401 or
 * 403), which is written to the channel's error row for the settings screen
 * rather than being a fact about one recipient.
 */
class ProviderException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly bool $revoke = false,
        public readonly bool $config = false,
    ) {
        parent::__construct($message);
    }

    public static function fromResponse(string $provider, Response $response, ?string $words = null, bool $revoke = false): self
    {
        $status = $response->status();
        $text = $words !== null && $words !== ''
            ? "{$provider} answered {$status}: {$words}"
            : "{$provider} answered {$status}.";

        return new self(mb_substr($text, 0, 480), $revoke, in_array($status, [401, 403], true));
    }
}
