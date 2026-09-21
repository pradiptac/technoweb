<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\CustomerStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateCustomerRequest;
use App\Http\Resources\Admin\AdminCustomerResource;
use App\Http\Resources\CustomerResource;
use App\Models\Customer;
use App\Notifications\CustomerApproved;
use App\Notifications\CustomerRejected;
use App\Notifications\VerifyCustomerEmail;
use App\Support\ListSort;
use App\Support\Notifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The approval queue, and everything else about a portal account.
 *
 * Gated on `support_engineer` rather than `admin`: deciding whether somebody
 * is a customer is support desk work, and putting it behind the administrator
 * role would mean every registration waits for one of two people. An `admin`
 * passes the check implicitly.
 *
 * Nothing here deletes a customer. A portal account is what tickets hang off,
 * so removing one either orphans a support history or takes it with it, and
 * neither is a thing to offer behind a confirm dialog. `suspended` is the
 * answer to "make this account stop working".
 */
class CustomerAdminController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $customers = Customer::query()
            ->status($request->string('status')->toString() ?: null)
            ->search($request->string('q')->toString() ?: null)
            ->when($request->filled('verified'), fn ($q) => $request->boolean('verified')
                ? $q->whereNotNull('email_verified_at')
                : $q->whereNull('email_verified_at'))
            ->withCount('tickets')
            ->with('approver:id,name')
            // Pending first, and oldest first within it. This screen is a queue
            // before it is a list, and a queue that hides its oldest item is
            // how somebody ends up waiting a fortnight.
            ->tap(fn ($q) => ListSort::apply($q, $request, [
                'name' => 'name',
                'company' => 'company',
                'created' => 'created_at',
                'status' => 'status',
            ], fn ($q) => $q->orderByRaw("CASE WHEN status = 'pending' THEN 0 ELSE 1 END")
                ->orderByRaw("CASE WHEN status = 'pending' THEN created_at END ASC")
                ->orderByDesc('created_at')))
            ->paginate(min((int) $request->integer('per_page', 25), 100))
            ->withQueryString();

        return AdminCustomerResource::collection($customers)
            ->additional(['meta' => [
                'pending_count' => Customer::where('status', CustomerStatus::Pending)->count(),
            ]])
            ->response();
    }

    public function show(Customer $customer): JsonResponse
    {
        $this->hydrate($customer);

        return response()->json(['data' => new AdminCustomerResource($customer)]);
    }

    public function update(UpdateCustomerRequest $request, Customer $customer): JsonResponse
    {
        $data = $request->validated();

        // Changing the address makes the old confirmation meaningless — it
        // proved somebody could read a different inbox. Re-confirming is not
        // optional, or an edit here becomes a way to point an approved account
        // at any address at all.
        if (isset($data['email']) && $data['email'] !== $customer->email) {
            $customer->forceFill(['email_verified_at' => null])->save();
            $customer->email = $data['email'];
            $customer->save();

            Notifier::send($customer, new VerifyCustomerEmail($customer->issueVerificationToken(), $customer->email));
        }

        $customer->update(collect($data)->except('email')->all());

        return response()->json(['data' => new AdminCustomerResource($this->hydrate($customer->fresh()))]);
    }

    /** Activate a pending account. The email people are waiting for. */
    public function approve(Request $request, Customer $customer): JsonResponse
    {
        if ($customer->status === CustomerStatus::Active) {
            return response()->json(['message' => 'That account is already active.'], 422);
        }

        // Deliberately allowed on an unconfirmed address, with the state said
        // out loud in the list and on the detail screen. Staff know their own
        // customers, and a phone call is a better proof than an inbox — but it
        // must be a decision somebody takes knowingly, not a default.
        $customer->forceFill([
            'status' => CustomerStatus::Active,
            'approved_at' => now(),
            'approved_by' => $request->user()->id,
            'status_note' => null,
        ])->save();

        Notifier::send($customer, new CustomerApproved);

        return response()->json(['data' => new AdminCustomerResource($this->hydrate($customer))]);
    }

    public function reject(Request $request, Customer $customer): JsonResponse
    {
        $data = $request->validate(['note' => ['nullable', 'string', 'max:500']]);

        $customer->forceFill([
            'status' => CustomerStatus::Rejected,
            'status_note' => $data['note'] ?? null,
        ])->save();

        // Every token goes. A rejection that leaves a live session running is
        // a rejection in name only.
        $customer->tokens()->delete();

        Notifier::send($customer, new CustomerRejected(Notifier::setting('support_email')));

        return response()->json(['data' => new AdminCustomerResource($this->hydrate($customer))]);
    }

    /** Switch an account off, or back on again. */
    public function status(Request $request, Customer $customer): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in([CustomerStatus::Active->value, CustomerStatus::Suspended->value])],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $next = CustomerStatus::from($data['status']);

        $customer->forceFill([
            'status' => $next,
            'status_note' => $data['note'] ?? null,
            'approved_at' => $customer->approved_at ?? ($next === CustomerStatus::Active ? now() : null),
            'approved_by' => $customer->approved_by ?? ($next === CustomerStatus::Active ? $request->user()->id : null),
        ])->save();

        if ($next === CustomerStatus::Suspended) {
            $customer->tokens()->delete();
        }

        return response()->json(['data' => new AdminCustomerResource($this->hydrate($customer))]);
    }

    /**
     * Send the confirmation link again, on behalf of someone who says it never
     * arrived. No cooldown here — a staff member doing this is answering a
     * person who is already on the phone.
     */
    public function resendVerification(Customer $customer): JsonResponse
    {
        if ($customer->hasVerifiedEmail()) {
            return response()->json(['message' => 'That address is already confirmed.'], 422);
        }

        Notifier::send($customer, new VerifyCustomerEmail($customer->issueVerificationToken(), $customer->email));

        return response()->json(['data' => new AdminCustomerResource($this->hydrate($customer->fresh()))]);
    }

    /**
     * Mint a token that lets the caller open the portal as this customer.
     *
     * The console's "View as": the fastest way to see what a customer is
     * looking at when they say a page is wrong. Three things about the token
     * are decisions rather than details.
     *
     * **Not `AuthController::issueToken()`.** That deletes every `portal` token
     * first — which would sign the customer out of their own browser while
     * somebody is trying to help them — and stamps `last_login_at`, which the
     * console shows as "Last signed in" and must not be forged by a staff
     * member's visit. So the token is minted here, under a name of its own.
     *
     * **An hour, and one at a time.** A short life bounds what a tab left open
     * on a shared screen can do; a fresh press retires the previous
     * impersonation of this customer, the one-token-per-name rule every other
     * token here follows. Sanctum's guard honours `expires_at` on its own.
     *
     * **Only an active account.** `EnsureUserIsCustomer` refuses every portal
     * request for any other status, so a token for a pending or suspended
     * customer would open a tab that 403s on arrival. A refusal with a
     * sentence is the better answer.
     *
     * The route sits in the `customers` group, which `ActivityLogger` records
     * in full; the logger reads request input only, so the plain token can
     * never land in the activity log.
     */
    public function impersonate(Customer $customer): JsonResponse
    {
        if (! $customer->status->canSignIn()) {
            return response()->json([
                'message' => 'Only an active account can be viewed as. This one is '
                    .strtolower($customer->status->label()).'.',
            ], 422);
        }

        $customer->tokens()->where('name', Customer::IMPERSONATION_TOKEN)->delete();

        $expires = now()->addMinutes(Customer::IMPERSONATION_MINUTES);
        $token = $customer->createToken(
            Customer::IMPERSONATION_TOKEN,
            ['portal', Customer::IMPERSONATION_ABILITY],
            $expires,
        );

        return response()->json([
            'token' => $token->plainTextToken,
            'customer' => new CustomerResource($customer),
            'expires_at' => $expires->toIso8601String(),
        ]);
    }

    /**
     * Load what `AdminCustomerResource` serialises.
     *
     * `whenLoaded` degrades to an *absent key*, not an error, so a relation
     * nobody loaded reads on screen as "nobody approved this" — which is a
     * different and worse thing than "we did not ask". Every action returns
     * the row its screen re-renders from, so every action goes through here.
     */
    private function hydrate(Customer $customer): Customer
    {
        return $customer->loadCount('tickets')->load('approver:id,name');
    }
}
