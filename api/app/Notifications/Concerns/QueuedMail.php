<?php

namespace App\Notifications\Concerns;

use App\Models\Setting;
use Illuminate\Bus\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Takes a notification off the request path, and keeps its failure visible.
 *
 * **The request path is the problem this exists for.** `config/mail.php` pins a
 * five-second SMTP timeout because an unreachable host was measured taking a
 * contact-form submission from 0.2s to 12.5s — long enough for a visitor to
 * press Send twice, and long enough that a handful of concurrent submissions
 * occupy every PHP worker there is. Five seconds is a floor under the failure,
 * never a fix; this is the fix, and it is the one `Notifier` has wanted since
 * tickets shipped.
 *
 * `use Queueable` alone does **not** queue anything — every notification in
 * this application already had it, and every one of them was sent inline. The
 * interface is what does it, which is why this trait is applied together with
 * `implements ShouldQueue` and never on its own.
 *
 * **A queued failure is silent, and that is the trap.** `Notifier::guard()`
 * catches a send that throws — but once this is queued, `Notification::send()`
 * only *dispatches*, so it cannot throw for an SMTP error and the guard has
 * nothing to catch. Without `failed()` below, a mail server that has stopped
 * accepting mail produces a console that looks perfectly healthy while every
 * receipt silently stops arriving. That is exactly the failure `mail_error`
 * was invented for, reintroduced by moving the send.
 */
trait QueuedMail
{
    use Queueable;

    /**
     * Three attempts, backing off.
     *
     * A transient refusal — a rate limit, a moment of DNS trouble — is the
     * common failure for a relay, and retrying is free. Retrying for ever is
     * not: a genuinely wrong password would sit in the queue behind every
     * later message, so it gives up and says so.
     */
    public int $tries = 3;

    /** @return array<int, int> */
    public function backoff(): array
    {
        return [10, 60];
    }

    public function failed(Throwable $e): void
    {
        /*
         * The same sentence the settings screen already renders, dated, and
         * cleared by a successful test — so the operator's path back to health
         * is unchanged: read the banner, fix the credentials, press Send test.
         */
        Setting::put('mail_error', 'Mail could not be delivered — '.$e->getMessage()
            .' ('.now()->toDayDateTimeString().')');

        // At `error`, which clears the shipped LOG_LEVEL of `warning`. A log
        // line an operator needs that is discarded by the level is a log line
        // that does not exist — the trap the password-reset audit fell into.
        Log::error('Queued notification failed', [
            'notification' => static::class,
            'error' => $e->getMessage(),
        ]);
    }
}
