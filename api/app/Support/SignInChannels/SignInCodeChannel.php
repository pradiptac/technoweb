<?php

namespace App\Support\SignInChannels;

use App\Enums\SignInAudience;

/**
 * How a sign-in code reaches the person asking for one.
 *
 * An interface with one method, and it earns its place: the second channel —
 * SMS — is a decision the client has not taken yet, and the difference between
 * "add a case" and "unpick email out of the controller" is the whole reason
 * this is written down now rather than later.
 *
 * `send()` returns whether it worked, which the caller cannot pass on to the
 * person waiting: a delivery failure reported at the sign-in form would tell a
 * stranger which addresses exist. It is recorded instead — see
 * `EmailSignInChannel`.
 */
interface SignInCodeChannel
{
    /** @return bool whether the code was handed to the transport successfully */
    public function send(string $recipient, string $code, SignInAudience $audience): bool;
}
