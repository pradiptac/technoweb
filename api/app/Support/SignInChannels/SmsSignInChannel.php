<?php

namespace App\Support\SignInChannels;

use App\Enums\SignInAudience;
use Illuminate\Support\Facades\Log;

/**
 * A code by SMS. Present, and deliberately not working.
 *
 * The same treatment Amazon SES gets in the mail settings: the option exists,
 * it reports itself unavailable, and the console says what would make it
 * available rather than hiding it. Three things are missing and none of them
 * is code:
 *
 *   - a gateway account and credentials (Twilio, MSG91 or similar);
 *   - **DLT registration** with TRAI — in India a transactional SMS needs a
 *     registered sender ID and a registered template, approved before the
 *     first message sends. That is measured in days and belongs to whoever
 *     owns the business relationship, not to a deploy;
 *   - a phone number to send to. `users` has no phone column at all, and a
 *     customer's `phone` is optional, so a channel that cannot reach half the
 *     accounts is not a channel anybody can be defaulted onto.
 *
 * It returns false rather than throwing, so a stored channel this server
 * cannot use degrades to "no code arrived" — the same shape as a mail outage —
 * instead of 500ing the sign-in form. `SignInChannel::isAvailable()` is what
 * stops it being chosen in the first place.
 */
class SmsSignInChannel implements SignInCodeChannel
{
    public function send(string $recipient, string $code, SignInAudience $audience): bool
    {
        Log::warning('SMS sign-in codes are not configured on this server', [
            'audience' => $audience->value,
        ]);

        return false;
    }
}
