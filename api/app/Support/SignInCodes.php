<?php

namespace App\Support;

use App\Enums\SignInAudience;
use App\Models\SignInCode;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Issuing and spending one-time sign-in codes.
 *
 * Every rule that decides whether a code is worth anything lives here rather
 * than on the model, because both audiences have to apply all of them and a
 * caller that remembers two out of three is the bug this class exists to make
 * impossible.
 *
 * The rules, and what each one blocks:
 *
 * **Hashed at rest.** A database read yields no working code — the same rule
 * `email_verification_token` and the password reset tokens follow.
 *
 * **Ten minutes.** Long enough for mail to arrive and be read on a phone,
 * short enough that a code left in an inbox is not a standing key.
 *
 * **Five wrong entries burn it.** This is the check that actually closes six
 * digits. A route throttle slows an online guess down; only the attempt cap
 * ends it, and 10⁶ is not a large enough space to leave to rate limiting.
 *
 * **Single-use, claimed atomically.** The consume is a conditional UPDATE on
 * `consumed_at IS NULL` with the affected row count checked, so two requests
 * arriving with the same code mint exactly one token. The obvious
 * read-then-write version passes every test written on one thread and is a
 * race in production — the same reasoning as the lock on the Google refresh.
 *
 * **A new code retires the old ones.** Otherwise a person pressing "send
 * another" three times leaves three live codes, and the guess space an
 * attacker faces is divided by three.
 *
 * **`random_int`, never `mt_rand` or `Str::random`.** Only the first is
 * cryptographically seeded, and the difference is invisible in every way
 * except the one that matters.
 *
 * Nothing here knows whether an account exists. That is the caller's business:
 * a row is written either way so the work done is identical from outside, and
 * only the caller decides whether anything is sent.
 */
final class SignInCodes
{
    public const TTL_MINUTES = 10;

    public const MAX_ATTEMPTS = 5;

    /** How long before pressing "send another" sends another. */
    public const RESEND_COOLDOWN_SECONDS = 60;

    public const LENGTH = 6;

    /**
     * Something to compare against when there is no code at all, so a request
     * for an unknown address costs the same as one for a known address. The
     * same constant the two login paths already use for a missing password.
     */
    private const DUMMY_HASH = '$2y$12$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG';

    /**
     * Mint a code, or return null when one was sent moments ago.
     *
     * Null is not a failure and must not be reported as one: the cooldown sits
     * *inside* the caller's identical-answer envelope, so that this endpoint
     * cannot be used to mail-bomb an address without a caller being able to
     * tell a cooldown from an address that does not exist.
     */
    public static function issue(SignInAudience $audience, string $email, ?string $ip = null): ?string
    {
        $email = self::normalise($email);

        if (self::coolingDown($audience, $email)) {
            return null;
        }

        // A fresh code retires whatever came before it, in the same breath as
        // being written.
        self::burnOutstanding($audience, $email);

        $plain = str_pad((string) random_int(0, 999999), self::LENGTH, '0', STR_PAD_LEFT);

        SignInCode::create([
            'audience' => $audience,
            'email' => $email,
            'code_hash' => Hash::make($plain),
            'ip' => $ip,
            'sent_at' => now(),
            'expires_at' => now()->addMinutes(self::TTL_MINUTES),
        ]);

        return $plain;
    }

    /**
     * Spend a code. True only for a live, unspent, correct one.
     *
     * Every false is the same false. Expired, burnt by too many attempts,
     * already used, wrong, and never issued at all are one answer to the
     * caller, because distinguishing them tells a stranger which addresses
     * exist — the rule the registration and reset endpoints already follow.
     */
    public static function consume(SignInAudience $audience, string $email, string $code): bool
    {
        $email = self::normalise($email);

        $row = SignInCode::query()
            ->where('audience', $audience)
            ->where('email', $email)
            ->whereNull('consumed_at')
            ->latest('id')
            ->first();

        if (! $row) {
            // Cost the same as a real comparison, so timing says nothing.
            Hash::check($code, self::DUMMY_HASH);

            return false;
        }

        if ($row->expires_at->isPast() || $row->attempts >= self::MAX_ATTEMPTS) {
            return false;
        }

        if (! Hash::check($code, $row->code_hash)) {
            $row->increment('attempts');

            return false;
        }

        /*
         * The claim, and the only line here that has to be atomic.
         *
         * `update()` on a query constrained to `consumed_at IS NULL` returns
         * the number of rows it actually changed, so the loser of a race gets
         * 0 and is refused. Reading the row and then saving it would let both
         * requests through, and both would be issued a token.
         */
        $claimed = SignInCode::query()
            ->whereKey($row->id)
            ->whereNull('consumed_at')
            ->update(['consumed_at' => now()]);

        if ($claimed !== 1) {
            return false;
        }

        self::burnOutstanding($audience, $email);

        return true;
    }

    /** Whether a code was sent to this address too recently to send another. */
    public static function coolingDown(SignInAudience $audience, string $email): bool
    {
        return SignInCode::query()
            ->where('audience', $audience)
            ->where('email', self::normalise($email))
            ->whereNull('consumed_at')
            ->where('sent_at', '>', now()->subSeconds(self::RESEND_COOLDOWN_SECONDS))
            ->exists();
    }

    /**
     * Drop codes that expired a while ago.
     *
     * A day rather than immediately on expiry: a support call about "it said
     * the code was no longer valid" is answerable while the row is still
     * there, and these rows carry nothing but a hash.
     */
    public static function prune(int $hours = 24): int
    {
        return SignInCode::query()
            ->where('expires_at', '<', now()->subHours($hours))
            ->delete();
    }

    public static function normalise(string $email): string
    {
        return Str::lower(trim($email));
    }

    private static function burnOutstanding(SignInAudience $audience, string $email): void
    {
        SignInCode::query()
            ->where('audience', $audience)
            ->where('email', $email)
            ->whereNull('consumed_at')
            ->update(['consumed_at' => now()]);
    }
}
