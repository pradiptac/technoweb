<?php

namespace App\Support\SignInChannels;

use App\Enums\SignInAudience;
use App\Models\Setting;
use App\Notifications\SignInCodeIssued;
use App\Support\Notifier;
use Illuminate\Support\Facades\Log;

/**
 * A code by email, through the transport chosen in the console.
 *
 * **Mail is on the request path, and this is where somebody feels it.**
 * `config/mail.php` pins a five-second timeout precisely because an
 * unreachable host once took a contact-form submission from 0.2s to 12.5s.
 * That was a form; this is the front door. Five seconds is a floor under the
 * failure rather than a fix, and the fix is a queue worker — a deployment
 * change, and the one worth making first if sign-in ever feels slow.
 *
 * A failure cannot be reported to whoever is waiting, because the response has
 * to be identical for an address that has no account. So it is recorded in the
 * two places an operator will actually find it: `mail_error`, which the
 * settings screen renders as a banner until a test send succeeds, and the log
 * at `warning` — both `.env` files ship `LOG_LEVEL=warning`, so `info` would
 * be discarded and the line would exist only in this file's intentions.
 */
class EmailSignInChannel implements SignInCodeChannel
{
    public function send(string $recipient, string $code, SignInAudience $audience): bool
    {
        $sent = Notifier::attempt($recipient, new SignInCodeIssued($code, $audience));

        if (! $sent) {
            Setting::put('mail_error', 'A sign-in code could not be sent — '.now()->toDayDateTimeString());

            // The address, never the code. With the `log` transport chosen,
            // the whole message is written to storage/logs/mail.log already;
            // there is no reason for a second copy of a live credential on
            // disk, in a file with different retention and different eyes on it.
            Log::warning('A sign-in code could not be delivered', [
                'audience' => $audience->value,
                'recipient' => $recipient,
            ]);
        }

        return $sent;
    }
}
