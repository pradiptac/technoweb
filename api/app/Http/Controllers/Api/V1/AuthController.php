<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\CustomerStatus;
use App\Enums\SignInAudience;
use App\Enums\SignInChannel;
use App\Http\Controllers\Concerns\ResetsPasswords;
use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Http\Requests\SignInCodeRequest;
use App\Http\Requests\UpdateProfileRequest;
use App\Http\Requests\VerifySignInCodeRequest;
use App\Http\Resources\CustomerResource;
use App\Models\Customer;
use App\Models\Setting;
use App\Notifications\CustomerRegistered;
use App\Support\Notifier;
use App\Support\SignInCodes;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * Customer login. Returns a Sanctum token which the Next.js server stores
     * in an httpOnly cookie — it is never handed to browser JavaScript.
     */
    use ResetsPasswords;

    public function forgotPassword(Request $request): JsonResponse
    {
        return $this->sendResetLinkFor($request, 'customers', 'portal');
    }

    public function resetPassword(Request $request): JsonResponse
    {
        return $this->resetPasswordFor($request, 'customers');
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $request->ensureIsNotRateLimited();

        $customer = Customer::where('email', $request->string('email'))->first();

        // Verify the hash even when the customer is missing, so response timing
        // does not reveal whether an email address exists.
        $valid = $customer
            ? Hash::check($request->string('password'), $customer->password)
            : Hash::check($request->string('password'), '$2y$12$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG');

        if (! $valid || ! $customer) {
            RateLimiter::hit($request->throttleKey());

            throw ValidationException::withMessages([
                'email' => 'These credentials do not match our records.',
            ])->status(401);
        }

        // Order matters. A rejected or suspended account is told it is not
        // active and nothing else — confirming an address it can never sign in
        // with would be busywork. Only then is an unconfirmed address worth
        // raising, because that is the one thing the person can act on. Pending
        // comes last: their part is done and they are waiting on us.
        if ($barred = $this->refuseIfBarred($customer)) {
            return $barred;
        }

        if (! $customer->hasVerifiedEmail()) {
            return $this->refuse(
                'Confirm your email address first — check your inbox for the link we sent.',
                'email_unverified',
            );
        }

        if (! $customer->status->canSignIn()) {
            return $this->refuse($customer->status->signInMessage(), $customer->status->reasonCode());
        }

        RateLimiter::clear($request->throttleKey());

        return $this->issueToken($customer);
    }

    /* --------------------------------------------------- sign in by code */

    /**
     * Send a one-time code to an address.
     *
     * **Every response is the same 202 and the same sentence** — unknown
     * address, real address, and an address that was sent a code moments ago
     * alike. Anything else turns the sign-in form into a membership oracle:
     * submit addresses, read which ones come back differently, and you have a
     * list of this company's customers, which for a support portal is a list
     * worth phishing. This is the rule `/auth/register` already follows, and
     * the reason a code row is written even when nothing is sent.
     *
     * One honest gap: mail goes out **inside this request**, so an address with
     * an account behind it takes measurably longer to answer than one without.
     * That is a timing side-channel, it is bounded by the throttle rather than
     * closed, and the fix is a queue worker rather than anything in this file —
     * the same deployment change `Notifier` has wanted since tickets shipped.
     */
    public function requestCode(SignInCodeRequest $request): JsonResponse
    {
        if (! Setting::get(SignInAudience::Portal->settingKey(), false)) {
            return response()->json([
                'message' => 'Signing in by code is switched off. Use your password.',
            ], 403);
        }

        $request->ensureIsNotRateLimited();

        $email = SignInCodes::normalise((string) $request->string('email'));
        $code = SignInCodes::issue(SignInAudience::Portal, $email, $request->ip());

        if ($code !== null && $customer = Customer::where('email', $email)->first()) {
            SignInChannel::active()->deliverer()->send($customer->email, $code, SignInAudience::Portal);
        }

        return response()->json([
            'message' => 'If that address has an account, a sign-in code is on its way. It expires in '
                .SignInCodes::TTL_MINUTES.' minutes.',
        ], 202);
    }

    /**
     * Spend a code and sign in.
     *
     * A correct code lands on the same refusal ladder a correct password does,
     * with one branch removed on purpose: **a delivered code that was typed
     * back is exactly the proof `POST /auth/verify-email` asks for**, so an
     * unconfirmed address is confirmed here rather than being told to go and
     * find an older email.
     *
     * That confirmation has to tell the support desk, the way the verification
     * endpoint does. Without it a customer proves their address, waits for an
     * approval, and **nobody ever learns they are waiting** — the queue is fed
     * by `CustomerRegistered` and by nothing else.
     */
    public function verifyCode(VerifySignInCodeRequest $request): JsonResponse
    {
        $request->ensureIsNotRateLimited(10);

        $email = SignInCodes::normalise((string) $request->string('email'));

        if (! SignInCodes::consume(SignInAudience::Portal, $email, (string) $request->string('code'))) {
            RateLimiter::hit($request->throttleKey());

            // One answer for wrong, expired, already-used, burnt through too
            // many attempts, and never issued at all.
            throw ValidationException::withMessages([
                'code' => 'That code is not valid any more. Ask for a new one.',
            ])->status(422);
        }

        $customer = Customer::where('email', $email)->first();

        // A code was spent against an address with no account. Only reachable
        // if the account was deleted between the two requests, and answered
        // like a bad code rather than like a missing account.
        if (! $customer) {
            throw ValidationException::withMessages([
                'code' => 'That code is not valid any more. Ask for a new one.',
            ])->status(422);
        }

        if ($barred = $this->refuseIfBarred($customer)) {
            return $barred;
        }

        if (! $customer->hasVerifiedEmail()) {
            $customer->markEmailVerified();

            Notifier::route('support_email', new CustomerRegistered($customer->fresh()));
        }

        if (! $customer->status->canSignIn()) {
            return $this->refuse($customer->status->signInMessage(), $customer->status->reasonCode());
        }

        RateLimiter::clear($request->throttleKey());

        return $this->issueToken($customer);
    }

    /**
     * Rejected and suspended, which are refused however you arrived.
     *
     * Shared by both ways in rather than written twice: two code paths
     * deciding whether an account may be here is how `is_active` and
     * `canSignIn()` once disagreed, and every authenticated portal request
     * 403'd.
     */
    private function refuseIfBarred(Customer $customer): ?JsonResponse
    {
        if (in_array($customer->status, [CustomerStatus::Rejected, CustomerStatus::Suspended], true)) {
            return $this->refuse($customer->status->signInMessage(), $customer->status->reasonCode());
        }

        return null;
    }

    /** One active token per login; old tokens for this device name are replaced. */
    private function issueToken(Customer $customer): JsonResponse
    {
        $customer->tokens()->where('name', 'portal')->delete();
        $token = $customer->createToken('portal', ['portal'], now()->addDays(14));

        $customer->forceFill(['last_login_at' => now()])->saveQuietly();

        return response()->json([
            'token' => $token->plainTextToken,
            'customer' => new CustomerResource($customer),
        ]);
    }

    /**
     * Refuse a login that had the right password.
     *
     * A 403 with a `reason` rather than a validation error, because the
     * frontend has a different screen for each of these — "confirm your
     * address" offers a resend button, "waiting for approval" offers nothing
     * and should not pretend to. A message string is not something to branch
     * on: it is written to be read by a person and will be reworded.
     */
    private function refuse(string $message, string $reason): JsonResponse
    {
        return response()->json([
            'message' => $message,
            'reason' => $reason,
            // Kept alongside so a client that only reads Laravel's usual
            // validation shape still shows the sentence rather than nothing.
            'errors' => ['email' => [$message]],
        ], 403);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['message' => 'Signed out.']);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['data' => new CustomerResource($request->user())]);
    }

    public function updateProfile(UpdateProfileRequest $request): JsonResponse
    {
        $customer = $request->user();
        $data = $request->safe()->except(['current_password', 'password_confirmation']);

        if ($request->filled('password')) {
            $data['password'] = $request->string('password')->value();
            // Changing a password invalidates every other session.
            $customer->tokens()->where('id', '!=', $customer->currentAccessToken()->id)->delete();
        }

        $customer->update($data);

        return response()->json(['data' => new CustomerResource($customer->fresh())]);
    }
}
