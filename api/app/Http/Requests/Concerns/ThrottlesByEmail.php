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
