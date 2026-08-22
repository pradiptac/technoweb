<?php

namespace App\Http\Controllers\Concerns;

use App\Notifications\ResetPassword;
use App\Support\Notifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;

/**
 * The forgot/reset pair, shared by the staff and customer controllers.
 *
 * Both sides behave identically and the differences are two arguments: which
 * broker, and which frontend form the emailed link opens. Writing it twice
 * would mean two places to get the enumeration rule wrong.
 *
 * The `For` suffix is not decoration: the controllers expose `resetPassword`
 * as their route action, and a trait method of the same name is silently
 * overridden by it — which turned the call below into infinite recursion the
 * first time round.
 */
trait ResetsPasswords
{
    /**
     * Always answers the same way.
     *
     * Whether the address exists, is inactive, or was throttled, the response
     * is one message and a 200. Anything else turns this endpoint into a
     * membership oracle: an attacker submits addresses and reads which ones
     * come back "not found" to learn who has an account — and for the staff
     * endpoint, that is a list of people worth phishing.
     *
     * The cost is that a typo looks like success. That is the right trade:
     * the email either arrives or it does not, and the user finds out either
     * way without the server confirming anything to a stranger.
     */
    protected function sendResetLinkFor(Request $request, string $broker, string $audience): JsonResponse
    {
        $request->validate(['email' => ['required', 'email', 'max:255']]);

        $email = (string) $request->string('email');

        $status = Password::broker($broker)->sendResetLink(
            ['email' => $email],
            function ($user, string $token) use ($email, $audience) {
                Notifier::send($user, new ResetPassword($token, $email, $audience));
            },
        );

        // Logged rather than returned, so an operator can tell a throttle from
        // an unknown address without the caller learning anything.
        logger()->info('Password reset requested', ['audience' => $audience, 'status' => $status]);

        return response()->json([
            'message' => 'If that address has an account, a reset link is on its way.',
        ]);
    }

    protected function resetPasswordFor(Request $request, string $broker): JsonResponse
    {
        $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
            'password' => ['required', 'confirmed', PasswordRule::min(12)],
        ], [
            'password.confirmed' => 'The two passwords do not match.',
        ]);

        $status = Password::broker($broker)->reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function ($user, string $password) {
                $user->forceFill([
                    'password' => $password,
                    'remember_token' => Str::random(60),
                ])->save();

                // Every existing session goes. Whoever asked for this reset may
                // be locking somebody else out on purpose, and a reset that
                // leaves the old sessions alive achieves nothing.
                $user->tokens()->delete();
            },
        );

        if ($status !== Password::PASSWORD_RESET) {
            return response()->json([
                // Deliberately one message for expired, already-used and
                // wrong-address alike — distinguishing them tells a stranger
                // which addresses exist.
                'message' => 'That reset link is no longer valid. Request a new one.',
                'errors' => ['token' => ['That reset link is no longer valid. Request a new one.']],
            ], 422);
        }

        return response()->json(['message' => 'Your password has been changed. Sign in with it.']);
    }
}
