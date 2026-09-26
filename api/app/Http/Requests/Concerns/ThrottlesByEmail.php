<?php

namespace App\Http\Requests\Concerns;

use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * The per-address-and-IP throttle both sign-in paths share.
 *
 * Keyed on **email plus IP**, not on either alone. On IP alone one office
 * behind one address locks itself out the moment two people mistype; on email
 * alone anybody who knows an address can lock its owner out from anywhere,
 * which is a denial of service dressed as a security control.
 *
 * Extracted from `LoginRequest` when codes arrived rather than copied into the
 * new request: two throttle keys that are meant to be the same key is exactly
 * the kind of thing that stays right for a month.
 *
 * **The IP half only means something when `ip()` is the visitor's.** Every
 * sign-in reaches this API through the Next server, and until 2026-09-26 the
 * API saw the Next host's address for everybody — so this key was
 * `email|<the Next server>`, which is email alone, which is exactly the
 * lockout described above: five wrong passwords from anywhere and the owner,
 * staff included, could not sign in for a minute. The Next server now sends
 * the visitor's address and the API believes it from `TRUSTED_PROXIES` only
 * (config/trustedproxy.php); `RateLimitScopeTest` pins both halves.
 *
 * **There is deliberately no per-address limit beside it.** A counter on the
 * email alone — however loose — is a switch anybody who knows an address can
 * throw, and "only slows" still means the owner is the one slowed. What bounds
 * a guess spread across many addresses is elsewhere: a sign-in code burns
 * after five wrong entries (`SignInCodes`), and a password is bcrypt behind a
 * per-route limit per visitor.
 */
trait ThrottlesByEmail
{
    public function throttleKey(): string
    {
        return Str::transliterate(Str::lower($this->string('email')).'|'.$this->ip());
    }

    public function ensureIsNotRateLimited(int $maxAttempts = 5): void
    {
        if (! RateLimiter::tooManyAttempts($this->throttleKey(), $maxAttempts)) {
            return;
        }

        $seconds = RateLimiter::availableIn($this->throttleKey());

        throw ValidationException::withMessages([
            'email' => "Too many login attempts. Try again in {$seconds} seconds.",
        ])->status(429);
    }
}
