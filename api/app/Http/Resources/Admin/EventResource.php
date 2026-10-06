<?php

namespace App\Http\Resources\Admin;

use App\Http\Resources\Concerns\IncludesAnswerContent;
use App\Models\Event;
use App\Support\Events\EventText;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * An event as the console edits it — deliberately not the public resource.
 *
 * It carries what the page must never have (`online_url`, the capacity, the
 * counts) and stored **paths** beside each picture's URL, because a form
 * round-trips a path and draws a preview from a URL.
 *
 * **Datetimes are wall-clock `Y-m-d\TH:i`** in `APP_TIMEZONE` — what a
 * `datetime-local` input holds and posts back — with `starts_at_iso` as the
 * instant for anything that needs one. A value read here and saved unchanged
 * is the same moment.
 *
 * `counts` is on index rows too: the list is where somebody decides which
 * event to open, and "12 of 40" is how they decide. `EventCounts::load()`
 * fills a page in one query; a single read asks for its own.
 *
 * `faqs`, `seo` and `seo_defaults` are on the detail read only, the rule
 * every CMS entity follows.
 *
 * @mixin Event
 */
class EventResource extends JsonResource
{
    use IncludesAnswerContent;

    public function toArray(Request $request): array
    {
        /** @var Event $event */
        $event = $this->resource;
        $detail = $request->routeIs('*.show', '*.store', '*.update', '*.duplicate');

        return [
            'id' => $event->id,
            'title' => $event->title,
            'slug' => $event->slug,
            'summary' => $event->summary,
            'body' => $this->when($detail, $event->body),
            'status' => $event->status->value,
            'status_label' => $event->status->label(),
            'is_featured' => (bool) $event->is_featured,
            'format' => $event->format->value,
            'format_label' => $event->format->label(),
            'starts_at' => EventText::wallClock($event->starts_at),
            'ends_at' => EventText::wallClock($event->ends_at),
            'starts_at_iso' => EventText::iso($event->starts_at),
            'date_label' => EventText::dateLabel($event),
            'time_label' => EventText::timeLabel($event),
            'is_past' => $event->isPast(),
            'venue_name' => $event->venue_name,
            'venue_city' => $event->venue_city,
            'venue_address' => $event->venue_address,
            'map_url' => $event->map_url,
            'online_url' => $event->online_url,
            'cover_image_path' => $event->cover_image_path,
            'cover_image' => $event->cover_image_path ? asset('storage/'.$event->cover_image_path) : null,
            'speakers' => array_values(array_map(fn (array $s) => [
                'name' => (string) ($s['name'] ?? ''),
                'role' => $s['role'] ?? null,
                'photo_path' => $s['photo_path'] ?? null,
                'photo' => filled($s['photo_path'] ?? null) ? asset('storage/'.$s['photo_path']) : null,
            ], $event->speakers ?? [])),
            'agenda' => array_values(array_map(fn (array $a) => [
                'time' => $a['time'] ?? null,
                'title' => (string) ($a['title'] ?? ''),
                'note' => $a['note'] ?? null,
            ], $event->agenda ?? [])),
            'registration_mode' => $event->registration_mode->value,
            'external_url' => $event->external_url,
            'capacity' => $event->capacity,
            'waitlist_enabled' => (bool) $event->waitlist_enabled,
            'max_seats' => (int) $event->max_seats,
            'registration_closes_at' => EventText::wallClock($event->registration_closes_at),
            'counts' => $event->registrationCounts()->toArray(),
            // Paths, never URLs — see CLAUDE.md on `frontend_url` in the console.
            'public_path' => $event->publicPath(),
            'admin_path' => $event->adminPath(),
            'faqs' => $this->when($detail, fn () => $this->adminFaqs()),
            'seo' => $this->when($detail, fn () => SeoOverrideArray::from($event->seo)),
            'seo_defaults' => $this->when($detail, fn () => $event->resolvedSeo()),
            'created_at' => EventText::iso($event->created_at),
            'updated_at' => EventText::iso($event->updated_at),
        ];
    }
}
