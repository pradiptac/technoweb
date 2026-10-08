<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\CustomerStatus;
use App\Enums\SignInAudience;
use App\Enums\SignInChannel;
use App\Enums\WebhookEvent;
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
use App\Notifications\VerifyCustomerEmail;
use App\Support\Address;
use App\Support\Auth\GoogleSignIn;
use App\Support\Auth\GoogleSignInRefused;
use App\Support\Notifier;
use App\Support\OAuth\CallbackPath;
use App\Support\SignInCodes;
use App\Support\Store\Wishlists;
use App\Support\Webhooks\WebhookPayload;
use App\Support\Webhooks\Webhooks;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
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
        /*
         * `password_login_enabled` is enforced here, not only by the form.
         *
         * It used to decide which step the sign-in screen opened on and
         * nothing else, so a switch that read "passwords are off" left the
         * endpoint taking them from anybody who posted to it. Refused before
         * the credentials are looked at, with one answer for every address,
         * so the refusal says nothing about which accounts exist.
         */
        if (! Setting::get('password_login_enabled', true)) {
            return $this->refuse(
                'Signing in with a password is switched off. Ask for a sign-in code instead.',
                'password_login_disabled',
            );
        }

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

        return $this->issueToken($customer, $request);
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
            // The code proves the mailbox, not who set the password on this
            // unconfirmed row — so the password is replaced and every other
            // session ends. See `Customer::markEmailVerified()`.
            $customer->markEmailVerified();

            Notifier::route('support_email', new CustomerRegistered($customer->fresh()));
            Webhooks::emit(WebhookEvent::CustomerRegistered, fn () => WebhookPayload::customer($customer->fresh()));
        }

        if (! $customer->status->canSignIn()) {
            return $this->refuse($customer->status->signInMessage(), $customer->status->reasonCode());
        }

        RateLimiter::clear($request->throttleKey());

        return $this->issueToken($customer, $request);
    }

    /**
     * Where to send a browser that pressed "Continue with Google"
     * (0.133.0, docs/auth.md "Signing in with Google").
     *
     * The website supplies its own callback address — only it knows the
     * origin it is reachable at — and the random value it has just put in an
     * httpOnly cookie, which `GoogleSignIn` binds the round trip to.
     */
    public function googleAuthorize(Request $request): JsonResponse
    {
        $data = $request->validate([
            'redirect_uri' => ['required', 'url', 'max:500'],
            'binding' => ['required', 'string', 'regex:/^[a-f0-9]{32,128}$/'],
        ]);

        if (! GoogleSignIn::live()) {
            return $this->refuse('Signing in with Google is not available.', 'google_login_disabled');
        }

        $redirect = CallbackPath::assert($data['redirect_uri'], GoogleSignIn::CALLBACK_PATH);

        return response()->json(['data' => ['url' => GoogleSignIn::authorizeUrl($redirect, $data['binding'])]]);
    }

    /**
     * Google sent the browser back: sign the customer in, or make their
     * account.
     *
     * Who this is, in order:
     *
     *   1. the customer already linked to that Google account (`google_sub`),
     *      whatever address they have since moved to here;
     *   2. the customer at the address Google has **verified** — linked from
     *      now on. A verified Google address is the same proof a sign-in
     *      code is: control of the mailbox;
     *   3. nobody — so a new account, while registration is open. It is born
     *      confirmed (Google confirmed the address) and `active` or
     *      `pending` exactly as a registration through the form would be.
     *
     * A first confirmation goes through `markEmailVerified()` like every
     * other, so a password somebody chose for an address they never proved
     * is replaced, that row's sessions end, and the address's paid guest
     * orders join the account. The desk is told for the reason
     * `verifyCode()` gives: the approval queue is fed by `CustomerRegistered`
     * and nothing else.
     *
     * Every refusal after Google has answered is the login's own 403 with
     * its `reason`. Saying "no account uses that address" here is not the
     * membership oracle `/auth/register` refuses to be: it is said only to
     * somebody Google has just confirmed owns the address.
     */
    public function googleCallback(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:2048'],
            'state' => ['required', 'string', 'max:128'],
            'redirect_uri' => ['required', 'url', 'max:500'],
            'binding' => ['required', 'string', 'regex:/^[a-f0-9]{32,128}$/'],
        ]);

        if (! GoogleSignIn::live()) {
            return $this->refuse('Signing in with Google is not available.', 'google_login_disabled');
        }

        $redirect = CallbackPath::assert($data['redirect_uri'], GoogleSignIn::CALLBACK_PATH);

        try {
            $who = GoogleSignIn::identify($data['code'], $data['state'], $redirect, $data['binding']);
        } catch (GoogleSignInRefused $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'reason' => 'google_'.$e->reason,
                'errors' => ['google' => [$e->getMessage()]],
            ], 422);
        }

        $customer = Customer::where('google_sub', $who['sub'])->first()
            ?? Customer::where('email', $who['email'])->first();

        if (! $customer) {
            if (! Setting::get('registration_enabled', false)) {
                return $this->refuse(
                    'No customer account uses that Google address, and new registrations are closed. Contact us and we will set one up for you.',
                    'registration_closed',
                );
            }

            try {
                $customer = Customer::create([
                    'name' => $who['name'],
                    'email' => $who['email'],
                    // Nobody knows it and nobody needs to: this account is
                    // reached through Google, a sign-in code, or a password
                    // its owner sets through "Forgot your password?".
                    'password' => Str::random(64),
                    'status' => Setting::get('customer_approval_required', false)
                        ? CustomerStatus::Pending
                        : CustomerStatus::Active,
                ]);
            } catch (UniqueConstraintViolationException) {
                // Two callbacks for one new address at once: the other made the row.
                $customer = Customer::where('email', $who['email'])->firstOrFail();
            }
        }

        if ($barred = $this->refuseIfBarred($customer)) {
            return $barred;
        }

        if ($customer->google_sub !== $who['sub']) {
            $customer->forceFill(['google_sub' => $who['sub']])->save();
        }

        // Google vouches for *its* address. A customer linked earlier who has
        // since moved their account to another address, and not confirmed
        // it, has proved nothing about that one by signing in to Google.
        if (! $customer->hasVerifiedEmail() && $customer->email === $who['email']) {
            $customer->markEmailVerified();

            Notifier::route('support_email', new CustomerRegistered($customer->fresh()));
            Webhooks::emit(WebhookEvent::CustomerRegistered, fn () => WebhookPayload::customer($customer->fresh()));
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

        return $this->issueToken($customer, $request);
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

    /**
     * One active token per login; old tokens for this device name are replaced.
     *
     * The one place both ways in finish, so it is where a guest's wishlist
     * joins the account's when the Next server forwards `X-Wishlist-Token`
     * (2026-09-25). Guarded inside `Wishlists::claim()` — a merge that fails
     * is reported and the sign-in answers as it would have. A staff member's
     * "View as" never comes through here, so it can never merge.
     */
    private function issueToken(Customer $customer, Request $request): JsonResponse
    {
        Wishlists::claim($customer, Wishlists::token($request));

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

    /**
     * `meta.impersonated` is what tells the portal to draw its "viewing as"
     * banner: a staff member holding a token from
     * `POST /admin/customers/{id}/impersonate` rather than a customer's own.
     * On the resource itself it would be a claim about the *customer*; it is
     * a claim about this session, so it rides beside the record.
     */
    public function me(Request $request): JsonResponse
    {
        /** @var Customer $customer */
        $customer = $request->user();

        return response()->json([
            'data' => new CustomerResource($customer),
            'meta' => ['impersonated' => $customer->isImpersonated()],
        ]);
    }

    public function updateProfile(UpdateProfileRequest $request): JsonResponse
    {
        /** @var Customer $customer */
        $customer = $request->user();

        // The one field an impersonation may not touch. The portal changes an
        // address without re-verifying it (the console's own edit forces a
        // fresh confirmation), so a staff session that could change it could
        // re-point the account at any inbox. Everything else is theirs to do —
        // reproducing the customer's problem is the point of the session.
        if ($request->has('email') && $customer->isImpersonated()) {
            throw ValidationException::withMessages([
                'email' => 'The email address cannot be changed while viewing this account as staff.',
            ]);
        }

        $data = $request->safe()->except(['current_password', 'password_confirmation']);

        if ($request->filled('password')) {
            $data['password'] = $request->string('password')->value();
            // Changing a password invalidates every other session.
            $customer->tokens()->where('id', '!=', $customer->currentAccessToken()->id)->delete();
        }

        /*
         * The two addresses cannot go through `update()` as they arrive.
         *
         * Both need normalising to one key order — they are compared with
         * `===` elsewhere to answer "is the delivery address the same as the
         * billing one", and a map assembled in whatever order the form posted
         * would make two identical addresses unequal. And an address left
         * entirely blank is **null**, not six null keys: a customer clearing
         * the form is saying they have no address on file, and storing an
         * empty husk would make the checkout open with a country and nothing
         * else.
         */
        if ($request->has('billing_address')) {
            $billing = Address::normalise((array) $request->input('billing_address', []));
            $data['billing_address'] = Address::isBlank($billing) ? null : $billing;
        }

        /*
         * `shipping_same` is the answer, and it is read from the tick box
         * rather than by comparing the blocks — the rule the checkout follows.
         * Ticked means one address, which is stored as null rather than as a
         * copy: two addresses that merely match today are two things free to
         * drift apart tomorrow.
         *
         * Absent means "this request said nothing about delivery", which must
         * leave whatever is on file alone — a screen that only edits the phone
         * number must not clear an address.
         */
        if ($request->has('shipping_same') || $request->has('shipping_address')) {
            $same = $request->boolean('shipping_same', ! $request->has('shipping_address'));
            $shipping = Address::normalise((array) $request->input('shipping_address', []));

            $data['shipping_address'] = $same || Address::isBlank($shipping) ? null : $shipping;
        }

        // Never a key the form did not send: `shipping_same` is a question,
        // not a column, and `update()` would throw on it.
        unset($data['shipping_same']);

        /*
         * A new address is unconfirmed until its inbox says otherwise.
         *
         * The old confirmation proved somebody reads a different mailbox.
         * Carried over, an edit here would point a confirmed account at any
         * address at all — and a confirmed account is what guest orders and
         * emailed tickets under that address are joined to. The console's
         * own edit has always done this (`CustomerAdminController::update`);
         * the portal's did not. The link goes to the new address, and
         * confirming it is a first confirmation, so `markEmailVerified()`
         * then replaces the password and ends every session.
         */
        $newEmail = isset($data['email']) ? Str::lower(trim((string) $data['email'])) : null;
        $emailChanged = $newEmail !== null && $newEmail !== Str::lower((string) $customer->email);

        if ($newEmail !== null) {
            $data['email'] = $newEmail;
        }

        $customer->update($data);

        if ($emailChanged) {
            $customer->forceFill(['email_verified_at' => null])->save();

            Notifier::send($customer, new VerifyCustomerEmail($customer->issueVerificationToken(), $customer->email));
        }

        return response()->json(['data' => new CustomerResource($customer->fresh())]);
    }
}
