<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\CustomerStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\RegisterCustomerRequest;
use App\Models\Customer;
use App\Models\Setting;
use App\Notifications\CustomerRegistered;
use App\Notifications\RegistrationAttempted;
use App\Notifications\VerifyCustomerEmail;
use App\Support\Notifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Self-registration for the customer portal.
 *
 * Three steps, and each exists because the one before it proves something the
 * next one needs:
 *
 *   1. **Register** — creates a `pending`, unverified account.
 *   2. **Verify** — proves the person can read the address they typed. A
 *      support ticket hangs off that address, so it is the one fact about a
 *      registration that has to be true.
 *   3. **Approve** — a staff decision, in the admin console. Anyone on the
 *      internet can complete steps 1 and 2; only a human can say this is a
 *      customer.
 *
 * Every response in this controller is deliberately uninformative about
 * whether an address already exists. See `sameAnswer()`.
 */
class RegistrationController extends Controller
{
    /** How long before a resend is worth sending again. */
    private const RESEND_COOLDOWN_SECONDS = 60;

    public function register(RegisterCustomerRequest $request): JsonResponse
    {
        if (! Setting::get('registration_enabled', false)) {
            return response()->json([
                'message' => 'Registration is closed at the moment. Contact us and we will set an account up for you.',
            ], 403);
        }

        // A real person never sees this field, so anything in it came from
        // something filling in every input it found. Answered exactly like a
        // success: telling a bot it was caught is telling it what to change.
        if (filled($request->input('website'))) {
            return $this->sameAnswer();
        }

        $email = Str::lower(trim((string) $request->string('email')));

        if ($existing = Customer::where('email', $email)->first()) {
            // Nothing is created and nothing changes. The person who actually
            // owns the address is told separately — they are the only one
            // entitled to know that an account exists.
            Notifier::send($existing, new RegistrationAttempted);

            // The response cannot say this happened, so the log has to. Someone
            // walking a list of addresses against this endpoint leaves no other
            // trace at all. `warning` because the shipped LOG_LEVEL is warning
            // — see the same note in ResetsPasswords.
            logger()->warning('Registration attempted on an existing account', [
                'customer_id' => $existing->id,
                'ip' => $request->ip(),
            ]);

            return $this->sameAnswer();
        }

        $customer = Customer::create([
            'name' => trim((string) $request->string('name')),
            'email' => $email,
            'password' => (string) $request->string('password'),
            'company' => $request->filled('company') ? trim((string) $request->string('company')) : null,
            'phone' => $request->filled('phone') ? trim((string) $request->string('phone')) : null,
            /*
             * `customer_approval_required` decides which of the two this is,
             * and it is the only place that decision is made — a verified
             * address still cannot sign in either way, since `canSignIn()`
             * asks for that separately. With the setting off this is `Active`
             * from the moment the address is confirmed, with no staff action
             * in between.
             */
            'status' => Setting::get('customer_approval_required', false)
                ? CustomerStatus::Pending
                : CustomerStatus::Active,
        ]);

        Notifier::send($customer, new VerifyCustomerEmail($customer->issueVerificationToken(), $customer->email));

        return $this->sameAnswer();
    }

    /**
     * Confirm an address.
     *
     * The support desk is told *here* rather than at registration: an
     * unverified row is noise, and a form open to the internet would otherwise
     * turn the support inbox into a spam folder. A confirmed address means a
     * real person is waiting, which is the only version of this worth
     * interrupting somebody for.
     */
    public function verify(Request $request): JsonResponse
    {
        $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'token' => ['required', 'string', 'max:128'],
        ]);

        $customer = Customer::where('email', Str::lower(trim((string) $request->string('email'))))->first();

        if ($customer?->hasVerifiedEmail()) {
            return response()->json([
                'message' => 'That address is already confirmed.',
                'status' => $customer->status->value,
                'already_verified' => true,
            ]);
        }

        if (! $customer || ! $customer->verificationTokenMatches((string) $request->string('token'))) {
            // One message for expired, already-used, wrong-token and
            // unknown-address alike, for the same reason the password reset
            // gives one: distinguishing them tells a stranger which addresses
            // exist.
            return response()->json([
                'message' => 'That confirmation link is no longer valid. Ask for a new one.',
                'errors' => ['token' => ['That confirmation link is no longer valid. Ask for a new one.']],
            ], 422);
        }

        $customer->markEmailVerified();

        Notifier::route('support_email', new CustomerRegistered($customer->fresh()));

        return response()->json([
            'message' => $customer->status->canSignIn()
                ? 'Your address is confirmed. You can sign in now.'
                : 'Your address is confirmed. A member of our team will activate your account shortly.',
            'status' => $customer->status->value,
            'already_verified' => false,
        ]);
    }

    /** Send the confirmation link again. Answers identically either way. */
    public function resendVerification(Request $request): JsonResponse
    {
        $request->validate(['email' => ['required', 'email', 'max:255']]);

        $customer = Customer::where('email', Str::lower(trim((string) $request->string('email'))))->first();

        $recentlySent = $customer?->email_verification_sent_at
            ?->addSeconds(self::RESEND_COOLDOWN_SECONDS)->isFuture() ?? false;

        // The cooldown is inside the same-answer envelope on purpose. It stops
        // this endpoint being used to mail-bomb an address, without the caller
        // being able to tell a cooldown from an unknown address.
        if ($customer && ! $customer->hasVerifiedEmail() && ! $recentlySent) {
            Notifier::send($customer, new VerifyCustomerEmail($customer->issueVerificationToken(), $customer->email));
        }

        return response()->json([
            'message' => 'If that address is waiting to be confirmed, a new link is on its way.',
        ]);
    }

    /**
     * The one response the register endpoint ever gives.
     *
     * Success, duplicate address and honeypot all land here. Anything else
     * turns the form into a membership oracle: submit addresses, read which
     * ones come back "already taken", and you have a list of this company's
     * customers — which for a support portal is a list worth phishing.
     *
     * The cost is that somebody who already has an account is told to check
     * their email. They are: `RegistrationAttempted` is waiting there,
     * explaining exactly what happened.
     */
    private function sameAnswer(): JsonResponse
    {
        return response()->json([
            'message' => 'Check your email — we have sent a link to confirm your address.',
        ], 202);
    }
}
