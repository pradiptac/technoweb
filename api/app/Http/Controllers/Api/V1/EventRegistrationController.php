<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\EventRegistrationStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\RegisterForEventRequest;
use App\Http\Resources\EventRegistrationResource;
use App\Models\Customer;
use App\Models\Event;
use App\Models\EventRegistration;
use App\Support\Events\EventActions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Registering for an event, and a registrant's own link back to it.
 *
 * Free, and for an event whose mode is `open` only. Everything it decides —
 * who gets a seat, who waits, who is turned away — is `EventActions`, under
 * the event's lock; this checks who is asking and answers.
 *
 * A registrant reaches their own registration with the token in their
 * confirmation **email** — never in the register response, which goes to
 * whoever typed the address — and every read or cancellation compares it
 * with `hash_equals`. A token
 * that is not 64 hex characters never reaches this class (the route refuses
 * it), and one that is nobody's is the same 404.
 */
class EventRegistrationController extends Controller
{
    public function store(RegisterForEventRequest $request, string $slug): JsonResponse
    {
        $event = Event::query()->published()->where('slug', $slug)->firstOrFail();
        $data = $request->validated();
        $seats = max(1, (int) ($data['seats'] ?? 1));
        $email = mb_strtolower(trim((string) $data['email']));

        /*
         * The honeypot: answered exactly like a success, and nothing is
         * stored or sent. Telling a bot it was caught tells it what to
         * change.
         */
        if (filled($request->input('website'))) {
            return $this->registered(EventRegistrationStatus::Confirmed, $seats, $email);
        }

        if ($seats > (int) $event->max_seats) {
            throw ValidationException::withMessages([
                'seats' => $event->max_seats === 1
                    ? 'Registration for this event is one seat at a time.'
                    : "You can register up to {$event->max_seats} seats at once. For a larger group, please contact us.",
            ]);
        }

        // The status a newcomer sending this body would be given — which is
        // also what an address that is already registered is told, with
        // nothing written. See `EventActions::register()`.
        $status = EventActions::register($event, $data, $request, self::customer($request));

        return $this->registered($status, $seats, $email);
    }

    public function show(string $token): EventRegistrationResource
    {
        return new EventRegistrationResource(self::byToken($token));
    }

    public function cancel(string $token): EventRegistrationResource
    {
        return new EventRegistrationResource(EventActions::cancel(self::byToken($token)));
    }

    /**
     * The one success answer: the status, and the seats **as asked for**.
     *
     * **There is no manage link in it.** The link carries the
     * registration's token, and this response goes to whoever typed an
     * address — which proves nothing about whose address it is. The link is
     * in the confirmation email, sent to the mailbox itself, and nowhere
     * else. Everything here is built from the request and the event's own
     * state, never from a stored registration, so it reads the same for an
     * address that has registered before and one that has not.
     */
    private function registered(EventRegistrationStatus $status, int $seats, string $email): JsonResponse
    {
        $waiting = $status === EventRegistrationStatus::Waitlisted;

        return response()->json([
            'message' => $waiting
                ? "This event is full, so you are on the waiting list. We have emailed {$email} and will write again if a place opens."
                : "You are registered. We have emailed your confirmation to {$email}.",
            'data' => [
                'status' => $waiting ? EventRegistrationStatus::Waitlisted->value : EventRegistrationStatus::Confirmed->value,
                'seats' => $seats,
            ],
        ], 201);
    }

    /**
     * The registration this token opens, or a 404. Found by the token and
     * then compared in constant time: the column's collation is
     * case-insensitive, and `hash_equals` is what makes the match exact.
     */
    private static function byToken(string $token): EventRegistration
    {
        $registration = EventRegistration::query()->where('token', $token)->with('event')->first();

        abort_if($registration === null || ! $registration->tokenMatches($token) || $registration->event === null, 404);

        return $registration;
    }

    /**
     * A signed-in customer is stamped onto the registration, read by naming
     * the guard — on a public route `$request->user()` is always null
     * (CLAUDE.md, "reads as working"). A staff member's "View as" session is
     * **not**: a registration filed under somebody's account should be one
     * they made.
     */
    private static function customer(Request $request): ?Customer
    {
        $user = $request->user('sanctum');

        return $user instanceof Customer && ! $user->isImpersonated() ? $user : null;
    }
}
