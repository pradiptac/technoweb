<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\MeetingSource;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreMeetingRequest;
use App\Http\Resources\MeetingResource;
use App\Models\Customer;
use App\Models\Meeting;
use App\Models\MeetingType;
use App\Support\Meetings\Availability;
use App\Support\Meetings\MeetingActions;
use App\Support\Meetings\MeetingSettings;
use App\Support\Meetings\MeetingText;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Online meetings, the public door (2026-09-29, docs/meetings.md): what can
 * be booked, the free times, the booking, and the guest's own meeting.
 *
 * A guest reaches their meeting with the token handed out **once**, on
 * create — the order's and the visit's rule — and every read or change
 * compares it with `hash_equals`. A wrong token and a wrong reference are the
 * same 404: a 403 would confirm the reference exists, and references are
 * sequential.
 *
 * The free times are never cached (`no-store`): a slot list is a claim about
 * this instant, and a cached one offers a time somebody took a minute ago.
 */
class MeetingController extends Controller
{
    /** What the page offers before a day is picked. Public and cacheable. */
    public function options(): JsonResponse
    {
        $min = Availability::day(now()->addHours(MeetingSettings::minNoticeHours()));
        $max = Availability::day(now())->addDays(MeetingSettings::maxDays());

        return response()->json(['data' => [
            'enabled' => MeetingSettings::enabled(),
            'types' => MeetingType::query()->bookable()->ordered()
                ->get(['id', 'name', 'slug', 'description', 'minutes'])
                ->map(fn (MeetingType $t) => [
                    'id' => $t->id,
                    'name' => $t->name,
                    'slug' => $t->slug,
                    'description' => $t->description,
                    'minutes' => $t->minutes,
                ])->values(),
            'step' => MeetingSettings::slotStep(),
            'min_notice_hours' => MeetingSettings::minNoticeHours(),
            'max_days' => MeetingSettings::maxDays(),
            'min_date' => $min->format('Y-m-d'),
            'max_date' => $max->format('Y-m-d'),
            'holidays' => array_values(array_filter(
                MeetingSettings::holidays(),
                fn (string $d) => $d >= $min->format('Y-m-d') && $d <= $max->format('Y-m-d'),
            )),
            'timezone' => MeetingSettings::timezone(),
            'timezone_label' => MeetingText::timezone(),
            'agenda_max' => StoreMeetingRequest::AGENDA_MAX,
        ]])->header('Cache-Control', 'public, max-age=300');
    }

    /**
     * `?type=&from=&to=`: every date in the range with how many start times
     * it has. `?type=&date=`: the times on one day — never which host.
     */
    public function slots(Request $request): JsonResponse
    {
        $type = self::bookableType($request);
        $open = MeetingSettings::enabled();
        $availability = Availability::for($type);

        if ($request->filled('date')) {
            $date = self::date($request, 'date');

            return self::noStore(['data' => [
                'type' => $type->slug,
                'date' => $date->format('Y-m-d'),
                'timezone' => MeetingSettings::timezone(),
                'timezone_label' => MeetingText::timezone(),
                'slots' => $open ? array_map(fn (array $slot) => [
                    'start' => $slot['start']->toIso8601String(),
                    'end' => $slot['end']->toIso8601String(),
                    'time_label' => $slot['start']->format('H:i'),
                ], $availability->slots($date)) : [],
            ]]);
        }

        [$from, $to] = self::range($request);

        $days = $availability->days($from, $to);

        if (! $open) {
            $days = array_map(fn (array $d) => ['date' => $d['date'], 'count' => 0], $days);
        }

        return self::noStore(['data' => [
            'type' => $type->slug,
            'from' => $from->format('Y-m-d'),
            'to' => $to->format('Y-m-d'),
            'timezone' => MeetingSettings::timezone(),
            'timezone_label' => MeetingText::timezone(),
            'days' => $days,
        ]]);
    }

    public function store(StoreMeetingRequest $request): JsonResponse
    {
        abort_unless(MeetingSettings::enabled(), 403, 'Meetings are not being booked online at the moment. Please get in touch with us instead.');

        $data = $request->validated();
        $type = MeetingType::query()->where('slug', $data['type'])->firstOrFail();
        $customer = self::customer($request);

        $meeting = MeetingActions::book(
            $type,
            MeetingActions::parseStart($data['start']),
            $data,
            $customer !== null ? MeetingSource::Portal : MeetingSource::Site,
            $request,
            $customer,
        );

        return response()->json([
            'message' => 'Your meeting is booked — we have emailed you the details.',
            'data' => [
                'reference' => $meeting->reference,
                // Handed out here and nowhere else.
                'access_token' => $meeting->access_token,
                'starts_at' => $meeting->starts_at->toIso8601String(),
                'date_label' => MeetingText::date($meeting->starts_at),
                'time_label' => MeetingText::time($meeting),
                'timezone' => MeetingText::timezone(),
            ],
        ], 201);
    }

    public function show(Request $request, string $reference): MeetingResource
    {
        return new MeetingResource(self::guest($request, $reference));
    }

    public function cancel(Request $request, string $reference): MeetingResource
    {
        $meeting = MeetingActions::cancel(self::guest($request, $reference), null, byCustomer: true);

        return (new MeetingResource($meeting->refresh()->load('meetingType')))
            ->additional(['message' => 'Your meeting is cancelled.']);
    }

    public function reschedule(Request $request, string $reference): MeetingResource
    {
        $meeting = self::guest($request, $reference);
        $request->validate(['start' => ['required', 'string', 'max:40']], ['start.required' => 'Choose a new time.']);

        $meeting = MeetingActions::move($meeting, MeetingActions::parseStart($request->input('start')), null, byCustomer: true);

        return (new MeetingResource($meeting->refresh()->load('meetingType')))
            ->additional(['message' => 'Your meeting has moved — we have emailed you the new time.']);
    }

    /* ------------------------------------------------------------------ */

    /** An active, public type by slug, or a 422 naming the field. */
    public static function bookableType(Request $request): MeetingType
    {
        $type = $request->filled('type')
            ? MeetingType::query()->bookable()->where('slug', $request->string('type')->value())->first()
            : null;

        if ($type === null) {
            throw ValidationException::withMessages(['type' => 'Choose one of the kinds of meeting listed.']);
        }

        return $type;
    }

    /** A `Y-m-d` parameter, as midnight on the app's clock. */
    public static function date(Request $request, string $key): CarbonImmutable
    {
        $value = $request->string($key)->value();

        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) || ! CarbonImmutable::hasFormat($value, 'Y-m-d')) {
            throw ValidationException::withMessages([$key => 'A date as YYYY-MM-DD.']);
        }

        return CarbonImmutable::createFromFormat('Y-m-d', $value, MeetingSettings::timezone())->startOfDay();
    }

    /**
     * `from` and `to`, both required, in order, at most
     * `Availability::MAX_RANGE_DAYS` apart.
     *
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     */
    public static function range(Request $request): array
    {
        if (! $request->filled('from') || ! $request->filled('to')) {
            throw ValidationException::withMessages(['date' => 'Ask for a date, or a from and a to.']);
        }

        $from = self::date($request, 'from');
        $to = self::date($request, 'to');

        if ($to->lt($from)) {
            throw ValidationException::withMessages(['to' => 'The end of the range is before its start.']);
        }

        if ($from->diffInDays($to) > Availability::MAX_RANGE_DAYS) {
            throw ValidationException::withMessages(['to' => 'At most '.Availability::MAX_RANGE_DAYS.' days at a time.']);
        }

        return [$from, $to];
    }

    /** @param  array<string, mixed>  $body */
    public static function noStore(array $body): JsonResponse
    {
        return response()->json($body)->header('Cache-Control', 'no-store, private');
    }

    /** The meeting this token opens, or a 404 — one 404 for a wrong reference and a wrong token. */
    private static function guest(Request $request, string $reference): Meeting
    {
        $meeting = Meeting::query()->where('reference', $reference)->with('meetingType')->first();
        $token = $request->input('token') ?? $request->query('token');

        abort_if($meeting === null || ! $meeting->tokenMatches(is_string($token) ? $token : null), 404);

        return $meeting;
    }

    /**
     * A signed-in customer is stamped onto the booking, read by naming the
     * guard — on a public route `$request->user()` is always null. Never a
     * staff member's "View as" session: a meeting filed under somebody's
     * account should be one they booked.
     */
    private static function customer(Request $request): ?Customer
    {
        $user = $request->user('sanctum');

        return $user instanceof Customer && ! $user->isImpersonated() ? $user : null;
    }
}
