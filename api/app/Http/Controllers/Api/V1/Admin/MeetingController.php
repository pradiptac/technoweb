<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\MeetingGoogleStatus;
use App\Enums\MeetingSource;
use App\Enums\MeetingStatus;
use App\Http\Controllers\Api\V1\MeetingController as PublicMeetingController;
use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\MeetingResource;
use App\Models\Customer;
use App\Models\Meeting;
use App\Models\MeetingType;
use App\Models\User;
use App\Support\ListSort;
use App\Support\Meetings\Availability;
use App\Support\Meetings\MeetingActions;
use App\Support\Meetings\MeetingCalendar;
use App\Support\Meetings\MeetingSettings;
use App\Support\Meetings\MeetingText;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * The meetings queue and diary, for the sales and support desks
 * (docs/meetings.md). `role:sales_manager,support_engineer`.
 *
 * Every change goes through `MeetingActions`, so a move made here is held to
 * the same lock as a customer's booking: the console may skip the notice
 * and the window, and go outside hours or over a Google busy time behind
 * the two confirm ticks, but can never overlap a meeting booked here.
 *
 * The activity log records the booking (a `store`) and nothing else here —
 * moves, cancellations and outcomes are the meeting's own trail.
 */
class MeetingController extends Controller
{
    /** The columns a header may sort by — `ListSort`'s allowlist. */
    public const SORTS = [
        'starts' => 'starts_at',
        'created' => 'created_at',
        'name' => 'name',
        'host' => 'host_name',
        'status' => 'status',
    ];

    public function index(Request $request): AnonymousResourceCollection
    {
        return self::listing($request, null);
    }

    /**
     * The list, for the desk (`$hostId` null) or for one host's own diary.
     * Counts in `meta` are over the whole scope, not the page.
     */
    public static function listing(Request $request, ?int $hostId): AnonymousResourceCollection
    {
        $scope = fn () => Meeting::query()->when($hostId !== null, fn ($q) => $q->where('host_id', $hostId));

        $query = self::filtered($request, $scope())->with(['meetingType', 'host:id,name,email']);

        /*
         * Default: what is still to happen, soonest first — the diary — then
         * everything else, most recent first.
         */
        ListSort::apply($query, $request, self::SORTS, fn (Builder $q) => $q
            ->orderByRaw("CASE WHEN status = 'scheduled' THEN 0 ELSE 1 END")
            ->orderByRaw("CASE WHEN status = 'scheduled' THEN starts_at END ASC")
            ->orderByDesc('starts_at'));

        $meetings = $query->paginate(min(max($request->integer('per_page', 20), 1), 100))->withQueryString();
        $today = Availability::day(now());

        return MeetingResource::collection($meetings)->additional(['meta' => [
            'statuses' => MeetingStatus::options(),
            'types' => MeetingType::query()->ordered()->get(['id', 'name', 'slug', 'is_active'])
                ->map(fn (MeetingType $t) => ['id' => $t->id, 'name' => $t->name, 'slug' => $t->slug, 'is_active' => $t->is_active])->values(),
            'hosts' => $hostId !== null
                ? User::query()->whereKey($hostId)->get(['id', 'name'])->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name])->values()
                : Availability::eligibleQuery()->orderBy('name')->get(['id', 'name'])
                    ->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name])->values(),
            'sources' => MeetingSource::options(),
            'needs_outcome_count' => $scope()->needsOutcome()->count(),
            'today_count' => $scope()->scheduled()
                ->where('starts_at', '>=', $today)->where('starts_at', '<', $today->addDay())->count(),
            'google_failed_count' => $scope()->where('google_status', MeetingGoogleStatus::Failed->value)->count(),
            'sorts' => ListSort::keys(self::SORTS),
            'timezone' => MeetingSettings::timezone(),
            'timezone_label' => MeetingText::timezone(),
        ]]);
    }

    /**
     * @param  Builder<Meeting>  $query
     * @return Builder<Meeting>
     */
    private static function filtered(Request $request, Builder $query): Builder
    {
        return $query
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')->value()))
            ->when($request->filled('host'), fn ($q) => $q->where('host_id', $request->integer('host')))
            ->when($request->boolean('mine'), fn ($q) => $q->where('host_id', $request->user()?->id))
            ->when($request->filled('type'), function ($q) use ($request) {
                $type = $request->string('type')->value();
                ctype_digit($type)
                    ? $q->where('meeting_type_id', (int) $type)
                    : $q->whereHas('meetingType', fn ($t) => $t->where('slug', $type));
            })
            ->when($request->filled('source'), fn ($q) => $q->where('source', $request->string('source')->value()))
            // A range on the start, on the app's clock, with plain comparisons
            // so the index is usable — never `whereDate` (CLAUDE.md).
            ->when($request->filled('from'), fn ($q) => $q->where('starts_at', '>=', PublicMeetingController::date($request, 'from')))
            ->when($request->filled('to'), fn ($q) => $q->where('starts_at', '<', PublicMeetingController::date($request, 'to')->addDay()))
            ->when($request->boolean('needs_outcome'), fn ($q) => $q->needsOutcome())
            ->when($request->string('google')->value() === 'failed', fn ($q) => $q->where('google_status', MeetingGoogleStatus::Failed->value))
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $request->string('q')->value());
                $q->where(fn ($w) => $w->where('reference', 'like', "%{$term}%")
                    ->orWhere('name', 'like', "%{$term}%")
                    ->orWhere('email', 'like', "%{$term}%")
                    ->orWhere('phone', 'like', "%{$term}%")
                    ->orWhere('company', 'like', "%{$term}%"));
            });
    }

    /**
     * Free times for the console: `?type=&date=` (or `from=&to=`), each slot
     * with the hosts free for it. `host=` narrows to one; `outside_hours=1`
     * and `google_busy=1` widen it for the confirm ticks and mark what needed
     * them; `exclude=<reference>` leaves a meeting's own block out, for a move.
     */
    public function slots(Request $request): JsonResponse
    {
        $type = self::activeType($request);
        $availability = Availability::for($type)
            ->forStaff()
            ->onlyHost($request->filled('host') ? $request->integer('host') : null)
            ->allowOutsideHours($request->boolean('outside_hours'))
            ->allowGoogleBusy($request->boolean('google_busy'));

        if ($request->filled('exclude')) {
            $id = Meeting::query()->where('reference', $request->string('exclude')->value())->value('id');
            $availability->excluding($id !== null ? (int) $id : null);
        }

        if ($request->filled('date')) {
            $date = PublicMeetingController::date($request, 'date');

            return PublicMeetingController::noStore(['data' => [
                'type' => $type->slug,
                'date' => $date->format('Y-m-d'),
                'timezone' => MeetingSettings::timezone(),
                'timezone_label' => MeetingText::timezone(),
                'slots' => array_map(fn (array $slot) => [
                    'start' => $slot['start']->toIso8601String(),
                    'end' => $slot['end']->toIso8601String(),
                    'time_label' => $slot['start']->format('H:i'),
                    'hosts' => $slot['hosts'],
                    // Set when no host is free without that override.
                    'outside_hours' => ! collect($slot['hosts'])->contains('outside_hours', false),
                    'google_busy' => ! collect($slot['hosts'])->contains('google_busy', false),
                ], $availability->slots($date)),
            ]]);
        }

        [$from, $to] = PublicMeetingController::range($request);

        return PublicMeetingController::noStore(['data' => [
            'type' => $type->slug,
            'from' => $from->format('Y-m-d'),
            'to' => $to->format('Y-m-d'),
            'timezone' => MeetingSettings::timezone(),
            'timezone_label' => MeetingText::timezone(),
            'days' => $availability->days($from, $to),
        ]]);
    }

    /** A booking made by the desk, for a customer on file or for anybody. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'string'],
            'start' => ['required', 'string', 'max:40'],
            'host_id' => ['nullable', 'integer'],
            'customer_id' => ['nullable', 'integer', Rule::exists(Customer::class, 'id')],
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'string', 'email:rfc', 'max:190'],
            'phone' => ['nullable', 'string', 'max:32'],
            'company' => ['nullable', 'string', 'max:160'],
            'agenda' => ['nullable', 'string', 'max:5000'],
            'outside_hours' => ['sometimes', 'boolean'],
            'override_google_busy' => ['sometimes', 'boolean'],
        ]);

        /** @var User $actor */
        $actor = $request->user();

        $meeting = MeetingActions::book(
            self::activeType($request),
            MeetingActions::parseStart($data['start']),
            $data,
            MeetingSource::Console,
            $request,
            isset($data['customer_id']) ? Customer::query()->find($data['customer_id']) : null,
            $actor,
            isset($data['host_id']) ? (int) $data['host_id'] : null,
            (bool) ($data['outside_hours'] ?? false),
            (bool) ($data['override_google_busy'] ?? false),
        );

        return (new MeetingResource(self::detail($meeting)))->response()->setStatusCode(201);
    }

    public function show(Meeting $meeting): MeetingResource
    {
        return new MeetingResource(self::detail($meeting));
    }

    /** The desk's note, and the outcome once the meeting has started. */
    public function update(Request $request, Meeting $meeting): MeetingResource
    {
        self::applyUpdate($request, $meeting);

        return new MeetingResource(self::detail($meeting->refresh()));
    }

    public function move(Request $request, Meeting $meeting): MeetingResource
    {
        $data = $request->validate([
            'start' => ['required', 'string', 'max:40'],
            'host_id' => ['nullable', 'integer'],
            'outside_hours' => ['sometimes', 'boolean'],
            'override_google_busy' => ['sometimes', 'boolean'],
        ]);

        /** @var User $actor */
        $actor = $request->user();

        MeetingActions::move(
            $meeting,
            MeetingActions::parseStart($data['start']),
            $actor,
            false,
            isset($data['host_id']) ? (int) $data['host_id'] : null,
            (bool) ($data['outside_hours'] ?? false),
            (bool) ($data['override_google_busy'] ?? false),
        );

        return new MeetingResource(self::detail($meeting->refresh()));
    }

    public function cancel(Request $request, Meeting $meeting): MeetingResource
    {
        $data = $request->validate(['reason' => ['nullable', 'string', 'max:500']]);

        /** @var User $actor */
        $actor = $request->user();

        MeetingActions::cancel($meeting, $data['reason'] ?? null, false, $actor);

        return new MeetingResource(self::detail($meeting->refresh()));
    }

    /** Retry a calendar sync — the button beside a failed one. */
    public function resync(Request $request, Meeting $meeting): MeetingResource
    {
        if (! app(MeetingCalendar::class)->connected()) {
            throw ValidationException::withMessages(['google' => 'Google Calendar is not connected. Connect it under Meetings → Settings first.']);
        }

        if ($meeting->google_status === MeetingGoogleStatus::Off && blank($meeting->google_event_id)) {
            throw ValidationException::withMessages(['google' => 'This meeting was booked while Google Calendar was not connected, so the customer has a calendar file instead. It stays that way, or they would have it twice.']);
        }

        /** @var User $actor */
        $actor = $request->user();

        MeetingActions::resync($meeting, $actor);

        return new MeetingResource(self::detail($meeting->refresh()));
    }

    /**
     * The staff note and the outcome — shared with "My meetings".
     */
    public static function applyUpdate(Request $request, Meeting $meeting): void
    {
        $data = $request->validate([
            'staff_note' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'status' => ['sometimes', Rule::enum(MeetingStatus::class)],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);

        /** @var User $actor */
        $actor = $request->user();

        if (array_key_exists('staff_note', $data)) {
            $meeting->staff_note = filled($data['staff_note']) ? trim((string) $data['staff_note']) : null;
            $meeting->save();
        }

        if (array_key_exists('status', $data)) {
            MeetingActions::outcome($meeting, MeetingStatus::from($data['status']), $data['note'] ?? null, $actor);
        }
    }

    public static function detail(Meeting $meeting): Meeting
    {
        return $meeting->load(['meetingType', 'host:id,name,email', 'events.user:id,name']);
    }

    /** An active type, by slug (or id), for the console — public or not. */
    private static function activeType(Request $request): MeetingType
    {
        $value = $request->string('type')->value();
        $type = $value === '' ? null : MeetingType::query()->active()
            ->where(fn ($q) => ctype_digit($value) ? $q->whereKey((int) $value) : $q->where('slug', $value))
            ->first();

        if ($type === null) {
            throw ValidationException::withMessages(['type' => 'Choose a kind of meeting that is switched on.']);
        }

        return $type;
    }
}
