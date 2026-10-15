<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\EventFormat;
use App\Enums\EventRegistrationMode;
use App\Enums\EventRegistrationStatus;
use App\Enums\PublishStatus;
use App\Http\Controllers\Api\V1\Admin\Concerns\HandlesBulk;
use App\Http\Controllers\Concerns\WritesAnswerContent;
use App\Http\Controllers\Controller;
use App\Http\Requests\BulkActionRequest;
use App\Http\Requests\StoreEventRequest;
use App\Http\Requests\UpdateEventRequest;
use App\Http\Resources\Admin\EventResource;
use App\Models\Event;
use App\Support\Events\EventActions;
use App\Support\Events\EventCounts;
use App\Support\Events\EventText;
use App\Support\Events\PublishCheck;
use App\Support\ListSort;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Events CRUD for the CMS (0.118.0, `docs/events.md`). Behind
 * `role:content_manager`; an administrator passes implicitly.
 *
 * An event is content — a page with a date — so it lives with the pages.
 * The people who registered are not content, and their screen is a
 * different role's (`EventRegistrationController`).
 *
 * `meta` rides on the index, the read and both writes, so every screen that
 * draws the form has the lists it is built from: the API sends the options,
 * the console never retypes them.
 */
class EventController extends Controller
{
    // `saveFaqs()`, typed on `Faqable`. Not `WritesCmsEntities`: an event has
    // no `published_at` for it to stamp, and its SEO row is written below
    // against the model itself rather than a bare `Model`.
    use HandlesBulk;
    use WritesAnswerContent;

    /** The columns a header may sort by — `ListSort`'s allowlist. */
    private const SORTS = [
        'starts' => 'starts_at',
        'title' => 'title',
        'status' => 'status',
    ];

    /** What moves an event for somebody who registered: the time, the place, the way in. */
    private const ANNOUNCED = ['starts_at', 'ends_at', 'format', 'venue_name', 'venue_city', 'venue_address', 'map_url', 'online_url'];

    public function index(Request $request): AnonymousResourceCollection
    {
        $now = now();
        $when = $request->string('when')->value();

        $query = Event::query()
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')->value()))
            ->when($request->filled('format'), fn ($q) => $q->where('format', $request->string('format')->value()))
            ->when($when === 'upcoming', fn ($q) => $q->upcoming($now))
            ->when($when === 'past', fn ($q) => $q->past($now))
            ->when($request->filled('q'), fn ($q) => $q->search($request->string('q')->value()));

        /*
         * Default: what is coming, soonest first, then what has been, newest
         * first — the list read top-down is "what do I need to look at
         * next", and last year's seminar is not it. "Coming" here is the
         * start, so the two halves are a plain range on one column.
         */
        ListSort::apply($query, $request, self::SORTS, fn (Builder $q) => $q
            ->orderByRaw('CASE WHEN starts_at >= ? THEN 0 ELSE 1 END', [$now->copy()->startOfDay()])
            ->orderByRaw('CASE WHEN starts_at >= ? THEN starts_at END ASC', [$now->copy()->startOfDay()])
            ->orderByDesc('starts_at'));

        $events = $query->paginate(min(max($request->integer('per_page', 20), 1), 100))->withQueryString();

        // One grouped query for the page, not one per row.
        EventCounts::load($events->getCollection());

        return EventResource::collection($events)->additional(['meta' => self::meta()]);
    }

    public function show(Event $event): JsonResponse
    {
        return $this->respond($event);
    }

    public function store(StoreEventRequest $request): JsonResponse
    {
        $event = DB::transaction(function () use ($request) {
            $event = Event::create($request->modelData());

            $this->saveFaqs($event, $request->validated('faqs'));
            $this->saveSeo($event, $request->validated('seo'));

            return $event;
        });

        return $this->respond($event, 201);
    }

    public function update(UpdateEventRequest $request, Event $event): JsonResponse
    {
        DB::transaction(function () use ($request, $event) {
            // Changing the slug leaves a 301 behind automatically — see the
            // updating hook in the Sluggable trait.
            $event->update($request->modelData());

            // Absent leaves the FAQs alone; `[]` clears them.
            $this->saveFaqs($event, $request->validated('faqs'));
            $this->saveSeo($event, $request->validated('seo'));
        });

        $moved = array_values(array_intersect(self::ANNOUNCED, array_keys($event->getChanges())));
        $announce = $request->boolean('notify_registrants') && $moved !== [];

        // The reminder belongs to a time: a new start owes everybody a new one.
        if ($event->wasChanged('starts_at')) {
            EventActions::resetReminders($event, $announce);
        }

        if ($announce) {
            EventActions::announceChange($event);
        }

        // More room — or none set any more — lets the waiting list move.
        if ($event->wasChanged(['capacity', 'registration_mode'])) {
            EventActions::promote($event);
        }

        return $this->respond($event->forgetRegistrationCounts());
    }

    /**
     * Refused while anybody has registered — cancelled registrations
     * included. Those rows are who was told what, and the leads they filed
     * point back at them; an event with a history is archived, which takes
     * it off the site and keeps the record.
     */
    public function destroy(Event $event): JsonResponse
    {
        $this->remove($event);

        return response()->json(['message' => 'Event deleted.']);
    }

    /**
     * `POST /admin/events/bulk` — publish, draft, archive or delete the ticked
     * events. Publishing is refused, per event, by the same join-link rule an
     * edit is held to; deleting by the registrations rule `destroy()` has.
     */
    public function bulk(BulkActionRequest $request): JsonResponse
    {
        return $this->runBulk(
            $request,
            Event::query(),
            $this->remove(...),
            function (Event $event, PublishStatus $status) {
                $refusal = PublishCheck::joinLinkRefusal($status, $event->format, $event->registration_mode, $event->online_url);

                if ($refusal !== null) {
                    throw ValidationException::withMessages(['online_url' => $refusal]);
                }
            },
        );
    }

    /** What deleting an event does, for `destroy()` and the bulk path alike. */
    private function remove(Event $event): void
    {
        if ($event->registrations()->exists()) {
            throw ValidationException::withMessages([
                'event' => 'People have registered for this event, so it cannot be deleted. Archive it instead.',
            ]);
        }

        // The SEO row and the FAQs are polymorphic, so nothing cascades them.
        DB::transaction(function () use ($event) {
            $event->seo()->delete();
            $event->faqs()->delete();
            $event->delete();
        });
    }

    /**
     * A draft copy: the same event under "(copy)" and a free slug, with its
     * FAQs and **no registrations**. How a series is made, since nothing
     * recurs — duplicate last month's, change the date, publish.
     *
     * The SEO override is not copied: two pages with one hand-written title
     * is the duplicate the SEO overview exists to find.
     */
    public function duplicate(Event $event): JsonResponse
    {
        $copy = DB::transaction(function () use ($event) {
            $copy = $event->replicate(['slug', 'status', 'is_featured']);
            $copy->title = mb_substr($event->title, 0, 153).' (copy)';
            $copy->status = PublishStatus::Draft;
            $copy->is_featured = false;
            // The slug was left out of the copy, so `Sluggable` derives a
            // free one from the new title.
            $copy->save();

            foreach ($event->faqs()->get() as $i => $faq) {
                $copy->faqs()->create(['question' => $faq->question, 'answer' => $faq->answer, 'sort_order' => $i]);
            }

            return $copy;
        });

        return $this->respond($copy, 201);
    }

    /**
     * Writes the SEO override row only when there is something to write —
     * `updateOrCreate` through the relation, never a hand-set `seoable_type`:
     * the morph map stores "event", not the class name.
     *
     * @param  array<string, mixed>|null  $seo
     */
    private function saveSeo(Event $event, ?array $seo): void
    {
        if ($seo !== null) {
            $event->seo()->updateOrCreate([], $seo);
        }
    }

    /**
     * One event with its `meta`. `->response()` rather than
     * `response()->json($resource)`: the second drops the `data` wrapper, so
     * a created event would come back shaped unlike every read of one.
     */
    private function respond(Event $event, int $status = 200): JsonResponse
    {
        $event->load(['seo', 'faqs']);

        return (new EventResource($event))
            ->additional(['meta' => self::meta()])
            ->response()
            ->setStatusCode($status);
    }

    /**
     * The lists the form is built from. No `custom_field_groups`: events
     * take no custom fields.
     *
     * @return array<string, mixed>
     */
    public static function meta(): array
    {
        return [
            'formats' => EventFormat::options(),
            'statuses' => array_map(
                fn (PublishStatus $s) => ['value' => $s->value, 'label' => $s->label()],
                PublishStatus::cases(),
            ),
            'registration_modes' => EventRegistrationMode::options(),
            'registration_statuses' => EventRegistrationStatus::options(),
            'max_speakers' => Event::MAX_SPEAKERS,
            'max_agenda' => Event::MAX_AGENDA,
            'timezone' => EventText::timezoneLabel(),
        ];
    }
}
