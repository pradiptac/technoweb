<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\EventFormat;
use App\Http\Controllers\Controller;
use App\Http\Resources\EventDetailResource;
use App\Http\Resources\EventResource;
use App\Models\Event;
use App\Support\Events\Availability;
use App\Support\Events\EventIcs;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/**
 * The public events pages (0.118.0, `docs/events.md`): the list, one event,
 * whether it can be registered for, and its calendar file.
 *
 * Published only. A draft or an archived event is a 404 on every one of
 * these; a **past** event stays readable — its page is a record of what was
 * on, and links to it do not rot the day after.
 *
 * Bound by slug in the method rather than by route-model binding, because
 * `events/registrations/{token}` lives under the same prefix and each of
 * these must refuse an unpublished event the same way.
 */
class EventController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $past = $request->string('when')->value() === 'past';
        // An unknown format is ignored rather than refused, the `?sort=`
        // rule: it arrives mangled from an old link, and the list is a
        // better answer than an error.
        $format = EventFormat::tryFrom($request->string('format')->value());

        $events = Event::query()
            ->published()
            ->with('seo')
            ->when($past, fn ($q) => $q->past(), fn ($q) => $q->upcoming())
            ->when($format !== null, fn ($q) => $q->where('format', $format))
            ->when($request->boolean('featured'), fn ($q) => $q->where('is_featured', true))
            // Soonest first for what is coming, newest first for what has
            // been; the id settles two events at one moment, so a page
            // boundary cannot show one twice.
            ->orderBy('starts_at', $past ? 'desc' : 'asc')
            ->orderBy('id', $past ? 'desc' : 'asc')
            ->paginate(min(max($request->integer('per_page', 12), 1), 50))
            ->withQueryString();

        return EventResource::collection($events);
    }

    public function show(string $slug): EventDetailResource
    {
        return $this->present($this->published($slug));
    }

    public function present(Event $event): EventDetailResource
    {
        $event->load(['seo', 'faqs']);

        return (new EventDetailResource($event))->withSchema();
    }

    /**
     * Whether somebody can register now. What the registration panel asks
     * after mount, since the page itself is ISR-cached — so this is never
     * cached, here or by anything in front of it.
     */
    public function availability(string $slug): JsonResponse
    {
        return response()
            ->json(['data' => Availability::for($this->published($slug))->toArray()])
            ->header('Cache-Control', 'no-store');
    }

    /** The event as a calendar file. No join link in it: `EventIcs::forEvent()` never reads one. */
    public function calendar(string $slug): Response
    {
        $event = $this->published($slug);

        return response(EventIcs::forEvent($event), 200, [
            'Content-Type' => 'text/calendar; charset=utf-8',
            'Content-Disposition' => 'attachment; filename='.EventIcs::filename($event),
        ]);
    }

    /** The published event at this slug, or a 404 — the same 404 for a draft and for nothing. */
    private function published(string $slug): Event
    {
        return Event::query()->published()->where('slug', $slug)->firstOrFail();
    }
}
