<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\MeetingResource;
use App\Models\Customer;
use App\Models\Meeting;
use App\Support\Meetings\MeetingActions;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * A signed-in customer's own online meetings, under `my/` for the reason
 * `my/visits` gives: `meetings/{reference}` is the guest route, authorised
 * by a secret in a link, and this is authorised by a session.
 *
 * Scoped by `customer_id` and nothing else — a meeting booked as a guest
 * with the same address is not pulled in by email. The cutoff and the
 * reschedule cap apply here exactly as on the guest link: both call
 * `MeetingActions` as the customer.
 */
class CustomerMeetingController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $meetings = Meeting::query()
            ->where('customer_id', self::me($request)->id)
            ->with('meetingType')
            ->orderByDesc('starts_at')
            ->orderByDesc('id')
            ->paginate(min(max($request->integer('per_page', 20), 1), 50));

        return MeetingResource::collection($meetings);
    }

    public function show(Request $request, string $reference): MeetingResource
    {
        return new MeetingResource(self::own($request, $reference));
    }

    public function cancel(Request $request, string $reference): MeetingResource
    {
        $meeting = MeetingActions::cancel(self::own($request, $reference), null, byCustomer: true);

        return (new MeetingResource($meeting->refresh()->load('meetingType')))
            ->additional(['message' => 'Your meeting is cancelled.']);
    }

    public function reschedule(Request $request, string $reference): MeetingResource
    {
        $meeting = self::own($request, $reference);
        $request->validate(['start' => ['required', 'string', 'max:40']], ['start.required' => 'Choose a new time.']);

        $meeting = MeetingActions::move($meeting, MeetingActions::parseStart($request->input('start')), null, byCustomer: true);

        return (new MeetingResource($meeting->refresh()->load('meetingType')))
            ->additional(['message' => 'Your meeting has moved — we have emailed you the new time.']);
    }

    private static function me(Request $request): Customer
    {
        $customer = $request->user();
        abort_unless($customer instanceof Customer, 403);

        return $customer;
    }

    /** Another customer's meeting is a 404, never a 403 — a 403 confirms it exists. */
    private static function own(Request $request, string $reference): Meeting
    {
        $meeting = Meeting::query()->where('reference', $reference)
            ->where('customer_id', self::me($request)->id)
            ->with('meetingType')
            ->first();
        abort_if($meeting === null, 404);

        return $meeting;
    }
}
