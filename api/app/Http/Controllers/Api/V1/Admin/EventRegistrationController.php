<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\EventRegistrationStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\RegisterForEventRequest;
use App\Http\Resources\Admin\EventRegistrationResource;
use App\Models\Event;
use App\Models\EventRegistration;
use App\Models\User;
use App\Support\Events\EventActions;
use App\Support\Events\EventSettings;
use App\Support\Events\EventText;
use App\Support\Newsletter\Csv;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Who is coming to an event: the list, the export, and the desk's moves.
 *
 * `role:content_manager,sales_manager` — whoever runs the event needs the
 * list to run it, and the sales desk needs it because every registration is
 * a lead it will follow up. The event itself (its page, its capacity) stays
 * with `content_manager` alone.
 *
 * Every move goes through `EventActions`, the same implementation the
 * public form and the registrant's link use, so a cancellation made here
 * promotes the waiting list exactly as one made there does.
 *
 * A registration addressed through another event's id is a 404: the
 * nested binding is scoped by Laravel and checked again by `own()`.
 */
class EventRegistrationController extends Controller
{
    public function index(Request $request, Event $event): AnonymousResourceCollection
    {
        $registrations = $this->filtered($request, $event)
            // Who has a seat, then the queue in the order it will be served,
            // then everybody else newest first.
            ->orderByRaw("CASE status WHEN 'confirmed' THEN 0 WHEN 'waitlisted' THEN 1 ELSE 2 END")
            ->orderByRaw("CASE WHEN status = 'waitlisted' THEN waitlisted_at END ASC")
            ->orderByRaw("CASE WHEN status = 'confirmed' THEN created_at END ASC")
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate(min(max($request->integer('per_page', 50), 1), 100))
            ->withQueryString();

        // Each row's `allowed_next` reads the event's clock; hand every row
        // the one event rather than letting any of them look it up.
        $registrations->getCollection()->each(fn (EventRegistration $r) => $r->setRelation('event', $event));

        return EventRegistrationResource::collection($registrations)->additional(['meta' => self::meta($event)]);
    }

    /**
     * The same rows, as a file.
     *
     * Streamed, and every cell escaped on the way out by `Csv::write` — a
     * name beginning `=` is a formula to Excel, and a public form is exactly
     * where somebody types one. There is one CSV writer in this application.
     */
    public function export(Request $request, Event $event): StreamedResponse
    {
        $query = $this->filtered($request, $event)->orderBy('id');

        return response()->streamDownload(function () use ($query) {
            $handle = fopen('php://output', 'w');

            Csv::write($handle, [
                'Registered', 'Name', 'Email', 'Phone', 'Company', 'Seats', 'Status',
                'Note', 'Staff note', 'Source', 'Reminded', 'Cancelled',
            ], (function () use ($query) {
                foreach ($query->lazyById(500) as $registration) {
                    yield [
                        self::stamp($registration->created_at),
                        $registration->name,
                        $registration->email,
                        $registration->phone,
                        $registration->company,
                        (string) $registration->seats,
                        $registration->status->label(),
                        $registration->note,
                        $registration->staff_note,
                        $registration->source === EventRegistration::SOURCE_STAFF ? 'Added by staff' : 'Website',
                        self::stamp($registration->reminded_at),
                        self::stamp($registration->cancelled_at),
                    ];
                }
            })());

            fclose($handle);
        }, $event->slug.'-registrations.csv', ['Content-Type' => 'text/csv; charset=utf-8']);
    }

    /**
     * The desk adds somebody — a telephone booking, a colleague's guest.
     *
     * The public fields, plus `force` to go past the capacity, a closing
     * date or the start, and `notify: false` to skip the confirmation (for
     * somebody already told in person). An address that already holds a
     * live registration is a 422 on `email` naming its status — that row is
     * on this screen, and is edited there; a cancelled one is revived.
     */
    public function store(Request $request, Event $event): JsonResponse
    {
        $data = $request->validate([
            ...RegisterForEventRequest::fields(),
            'force' => ['nullable', 'boolean'],
            'notify' => ['nullable', 'boolean'],
        ], RegisterForEventRequest::wording());

        /** @var User $actor */
        $actor = $request->user();

        $registration = EventActions::add(
            $event,
            $data,
            $request,
            $actor,
            force: $request->boolean('force'),
            notify: $request->boolean('notify', true),
        );

        return (new EventRegistrationResource($registration))
            ->additional(['meta' => self::meta($event)])
            ->response()
            ->setStatusCode(201);
    }

    /**
     * Status, the size of the party, the desk's note.
     *
     * The status is checked against the enum's moves and against the room;
     * `attended` and `no_show` are refused before the event has started.
     * `force` lets the desk confirm a party, or grow one, past the capacity.
     */
    public function update(Request $request, Event $event, EventRegistration $registration): EventRegistrationResource
    {
        $this->own($event, $registration);

        $data = $request->validate([
            'status' => ['sometimes', Rule::enum(EventRegistrationStatus::class)],
            'seats' => ['sometimes', 'integer', 'min:1', 'max:'.EventSettings::SEATS_CEILING],
            'staff_note' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'force' => ['nullable', 'boolean'],
        ]);

        /** @var User $actor */
        $actor = $request->user();
        $force = $request->boolean('force');
        $registration->setRelation('event', $event);

        if (array_key_exists('staff_note', $data)) {
            $registration->staff_note = filled($data['staff_note']) ? trim((string) $data['staff_note']) : null;
            $registration->save();
        }

        if (array_key_exists('seats', $data) && (int) $data['seats'] !== (int) $registration->seats) {
            $registration = EventActions::changeSeats($registration, (int) $data['seats'], $force);
        }

        if (array_key_exists('status', $data)) {
            $registration = EventActions::move($registration, EventRegistrationStatus::from($data['status']), $actor, $force);
        }

        $registration->refresh()->setRelation('event', $event->forgetRegistrationCounts());

        return (new EventRegistrationResource($registration))->additional(['meta' => self::meta($event)]);
    }

    /** For good. The waiting list moves if it held a seat; nobody is emailed. */
    public function destroy(Event $event, EventRegistration $registration): JsonResponse
    {
        $this->own($event, $registration);

        $registration->setRelation('event', $event);
        EventActions::remove($registration);

        return response()->json(null, 204);
    }

    /** @return Builder<EventRegistration> */
    private function filtered(Request $request, Event $event): Builder
    {
        return EventRegistration::query()
            ->where('event_id', $event->id)
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')->value()))
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = addcslashes($request->string('q')->value(), '%_\\');
                $q->where(fn ($w) => $w->where('name', 'like', "%{$term}%")
                    ->orWhere('email', 'like', "%{$term}%")
                    ->orWhere('company', 'like', "%{$term}%")
                    ->orWhere('phone', 'like', "%{$term}%"));
            });
    }

    /** A registration reached through another event's id does not exist. */
    private function own(Event $event, EventRegistration $registration): void
    {
        abort_unless((int) $registration->event_id === (int) $event->id, 404);
    }

    /**
     * What the registrations screen needs to know about the event it is
     * showing. A sales manager cannot read `/admin/events/{id}`, so this is
     * the only place that screen learns the event's name, its date, how
     * full it is, how many seats one registration may hold — and whether it
     * has **started**, which is what decides if Attended and No-show may be
     * offered. `has_started` is the same clock `EventActions::move()` and
     * each row's `allowed_next` use.
     *
     * @return array<string, mixed>
     */
    private static function meta(Event $event): array
    {
        return [
            'event' => [
                'id' => $event->id,
                'title' => $event->title,
                'status' => $event->status->value,
                'date_label' => EventText::dateLabel($event),
                'time_label' => EventText::timeLabel($event),
                'has_started' => $event->hasStarted(),
                'counts' => $event->registrationCounts()->toArray(),
                'capacity' => $event->capacity,
                'max_seats' => (int) $event->max_seats,
                'waitlist_enabled' => (bool) $event->waitlist_enabled,
            ],
            'statuses' => EventRegistrationStatus::options(),
        ];
    }

    private static function stamp(?CarbonInterface $at): ?string
    {
        return $at === null ? null : EventText::local($at)->toDateTimeString();
    }
}
