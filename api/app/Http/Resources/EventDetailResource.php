<?php

namespace App\Http\Resources;

use App\Enums\EventRegistrationMode;
use App\Http\Resources\Concerns\IncludesSchema;
use App\Models\Event;
use App\Support\Events\EventText;
use App\Support\MediaMeta;
use App\Support\StructuredData;
use Illuminate\Http\Request;

/**
 * An event's page: the index row plus everything only the page shows.
 *
 * `registration` says how the panel is *built* — the mode, the closing
 * date, how many seats one registration may ask for, whether there is a
 * capacity and a waiting list — and nothing about how full the room is.
 * That is `GET /events/{slug}/availability`, asked after mount and never
 * cached, because this response is ISR-cached and a seat count in it would
 * be a figure from ten minutes ago. No count is published by either.
 *
 * `speakers` and `agenda` are `[]` when empty, never null, in the editor's
 * order; a speaker's stored `photo_path` becomes a URL with the library's
 * alt text and focal point, the rule every picture here follows.
 *
 * The join link (`online_url`) is absent, as it is from the row — see
 * `EventResource`.
 *
 * @mixin Event
 */
class EventDetailResource extends EventResource
{
    use IncludesSchema;

    public function toArray(Request $request): array
    {
        /** @var Event $event */
        $event = $this->resource;
        $open = $event->registration_mode === EventRegistrationMode::Open;

        return [
            ...$this->row(),
            'body' => $event->body,
            'venue_address' => $event->format->hasVenue() ? $event->venue_address : null,
            'map_url' => $event->format->hasVenue() ? $event->map_url : null,
            'speakers' => array_values(array_map(fn (array $s) => [
                'name' => (string) ($s['name'] ?? ''),
                'role' => $s['role'] ?? null,
                'photo' => filled($s['photo_path'] ?? null) ? asset('storage/'.$s['photo_path']) : null,
                'photo_alt' => MediaMeta::alt($s['photo_path'] ?? null) ?: (string) ($s['name'] ?? ''),
                'photo_focus' => MediaMeta::focus($s['photo_path'] ?? null),
                'photo_blur' => MediaMeta::blur($s['photo_path'] ?? null),
            ], $event->speakers ?? [])),
            'agenda' => array_values(array_map(fn (array $a) => [
                'time' => $a['time'] ?? null,
                'title' => (string) ($a['title'] ?? ''),
                'note' => $a['note'] ?? null,
            ], $event->agenda ?? [])),
            'registration' => [
                'mode' => $event->registration_mode->value,
                'external_url' => $event->registration_mode === EventRegistrationMode::External ? $event->external_url : null,
                'closes_at' => $open ? EventText::iso($event->registration_closes_at) : null,
                'closes_label' => $open ? EventText::closesLabel($event) : null,
                'max_seats' => (int) $event->max_seats,
                // Whether a room can fill, never how full it is.
                'has_capacity' => $open && $event->capacity !== null,
                'waitlist' => $open && $event->capacity !== null && $event->waitlist_enabled,
            ],
            'calendar_path' => $event->publicPath().'/calendar',
            'faqs' => FaqResource::collection($this->whenLoaded('faqs')),
            // An FAQPage over the FAQs; absent under two entries, like every other record.
            'faq_schema' => $this->faqSchema(),
            /*
             * The page's JSON-LD, built server-side and gated on
             * `withSchema()` — see the IncludesSchema trait. The frontend
             * renders it through `JsonLd`, which escapes `<`.
             */
            'schema' => $this->schema(fn () => StructuredData::event($event)),
        ];
    }
}
