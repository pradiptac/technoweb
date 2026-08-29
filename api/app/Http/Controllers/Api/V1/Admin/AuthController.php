<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\SignInAudience;
use App\Enums\SignInChannel;
use App\Http\Controllers\Concerns\ResetsPasswords;
use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Http\Requests\SignInCodeRequest;
use App\Http\Requests\VerifySignInCodeRequest;
use App\Http\Resources\UserResource;
use App\Models\Setting;
use App\Models\User;
use App\Support\ActivityLogger;
use App\Support\SignInCodes;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;

/**
 * Staff login. Entirely separate from AuthController::login, which is
 * hardcoded to the Customer model — a staff user is never a customer and
 * vice versa. Returns a Sanctum token the Next.js admin app stores in its
 * own httpOnly cookie, same as the portal does for customers.
 */
class AuthController extends Controller
{
    use ResetsPasswords;

    /** Staff use their own broker and their own reset form. */
    public function forgotPassword(Request $request): JsonResponse
    {
        return $this->sendResetLinkFor($request, 'users', 'admin');
    }

    public function resetPassword(Request $request): JsonResponse
    {
        return $this->resetPasswordFor($request, 'users');
    }

    /**
     * A staff member changing their own password.
     *
     * Available to every signed-in role, not just administrators. Without it a
     * support engineer had no way to change their own password at all —
     * /admin/staff is role:admin, so they would have had to ask an
     * administrator to do it, who would then know their password.
     *
     * The current password is required. A borrowed unlocked laptop should not
     * be enough to lock the owner out of their own account.
     */
    public function changePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'confirmed', 'different:current_password', PasswordRule::min(12)],
        ], [
            'password.confirmed' => 'The two passwords do not match.',
            'password.different' => 'That is the password you already have.',
        ]);

        $user = $request->user();

        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => 'That is not your current password.',
            ]);
        }

        $currentToken = $user->currentAccessToken();

        $user->forceFill(['password' => $data['password']])->save();

        // Every other session goes, but not this one — signing someone out of
        // the page they are standing on to tell them it worked is hostile, and
        // they have just proved they know the old password.
        $user->tokens()->where('id', '!=', $currentToken?->id)->delete();

        return response()->json(['message' => 'Password changed. Any other devices have been signed out.']);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $request->ensureIsNotRateLimited();

        $user = User::where('email', $request->string('email'))->first();

        // Verify the hash even when the user is missing, so response timing
        // does not reveal whether an email address exists.
        $valid = $user
            ? Hash::check($request->string('password'), $user->password)
            : Hash::check($request->string('password'), '$2y$12$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG');

        if (! $valid || ! $user) {
            RateLimiter::hit($request->throttleKey());

            // The response says nothing on purpose, so this line is the only
            // record that the attempt happened at all.
            ActivityLogger::signInFailed((string) $request->string('email'), $request);

            throw ValidationException::withMessages([
                'email' => 'These credentials do not match our records.',
            ])->status(401);
        }

        if (! $user->is_active) {
            ActivityLogger::signInFailed((string) $request->string('email'), $request, 'account_inactive');

            throw ValidationException::withMessages([
                'email' => 'This staff account has been deactivated.',
            ])->status(403);
        }

        RateLimiter::clear($request->throttleKey());

        return $this->issueToken($user, $request);
    }

    /* --------------------------------------------------- sign in by code */

    /**
     * Send a one-time code to a staff address.
     *
     * The same identical-answer rule the portal follows, for a sharper reason:
     * the addresses here belong to the handful of people who can edit the site,
     * and an endpoint that distinguishes "no such account" from "code sent" is
     * a way to find out who they are.
     *
     * **This is where the console's security trade lives.** With codes as the
     * default, whoever can read a staff mailbox can sign in as that person —
     * where before they needed the mailbox *and* the password. It is deliberate
     * and it is reversible without a deploy: `otp_admin_login_enabled` turns it
     * off, and `password_login_enabled` is the other half of that decision.
     */
    public function requestCode(SignInCodeRequest $request): JsonResponse
    {
        if (! Setting::get(SignInAudience::Admin->settingKey(), false)) {
            return response()->json([
                'message' => 'Signing in by code is switched off. Use your password.',
            ], 403);
        }

        $request->ensureIsNotRateLimited();

        $email = SignInCodes::normalise((string) $request->string('email'));

        // Every request, whether or not the address is one of ours. A run of
        // these against unknown addresses is the only trace enumeration leaves.
        ActivityLogger::signInCodeRequested($email, $request);

        $code = SignInCodes::issue(SignInAudience::Admin, $email, $request->ip());

        if ($code !== null && $user = User::where('email', $email)->first()) {
            SignInChannel::active()->deliverer()->send($user->email, $code, SignInAudience::Admin);
        }

        return response()->json([
            'message' => 'If that address has a staff account, a sign-in code is on its way. It expires in '
                .SignInCodes::TTL_MINUTES.' minutes.',
        ], 202);
    }

    /**
     * Spend a code and sign in.
     *
     * A staff code and a portal code are different secrets and neither is
     * accepted here — `SignInCodes` is keyed on the audience, which is the
     * whole defence against the mistake the shared `password_reset_tokens`
     * table made once: a token issued to a customer resetting the staff account
     * at the same address.
     */
    public function verifyCode(VerifySignInCodeRequest $request): JsonResponse
    {
        $request->ensureIsNotRateLimited(10);

        $email = SignInCodes::normalise((string) $request->string('email'));

        if (! SignInCodes::consume(SignInAudience::Admin, $email, (string) $request->string('code'))) {
            RateLimiter::hit($request->throttleKey());

            ActivityLogger::signInFailed($email, $request, 'bad_code');

            throw ValidationException::withMessages([
                'code' => 'That code is not valid any more. Ask for a new one.',
            ])->status(422);
        }

        $user = User::where('email', $email)->first();

        if (! $user) {
            throw ValidationException::withMessages([
                'code' => 'That code is not valid any more. Ask for a new one.',
            ])->status(422);
        }

        if (! $user->is_active) {
            ActivityLogger::signInFailed($email, $request, 'account_inactive');

            throw ValidationException::withMessages([
                'email' => 'This staff account has been deactivated.',
            ])->status(403);
        }

        RateLimiter::clear($request->throttleKey());

        return $this->issueToken($user, $request);
    }

    /**
     * One active token per sign-in, however it was reached.
     *
     * Shared rather than repeated: the token name, its abilities, its lifetime
     * and the activity line are four things that have to agree between the two
     * ways in, and there is no version of them drifting apart that is not a
     * security bug.
     */
    private function issueToken(User $user, Request $request): JsonResponse
    {
        $user->tokens()->where('name', 'admin')->delete();
        $token = $user->createToken('admin', ['admin'], now()->addDays(14));

        ActivityLogger::signIn($user, $request);

        return response()->json([
            'token' => $token->plainTextToken,
            'staff' => new UserResource($user->load('roles')),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['message' => 'Signed out.']);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['data' => new UserResource($request->user()->load('roles'))]);
    }
}
