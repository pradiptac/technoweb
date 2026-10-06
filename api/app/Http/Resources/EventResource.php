<?php

namespace App\Http\Resources;

use App\Http\Resources\Concerns\IncludesSeo;
use App\Models\Event;
use App\Support\Events\EventText;
use App\Support\MediaMeta;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * An event as the public site lists it — the index row, and the top of the
 * detail (`EventDetailResource` extends this).
 *
 * **Every label is the API's.** `date_label`, `time_label`, `format_label`
 * and the three parts of the date tile (`day`, `month`, `year`) are written
 * here, in `APP_TIMEZONE`, so no frontend formats an event's date — a date
 * formatted in a browser is in that browser's zone.
 *
 * **`online_url` is not here and must never be.** The join link goes to
 * people who registered. It is absent structurally — this class does not
 * name the column — rather than stripped, the lesson the ticket module's
 * internal notes taught.
 *
 * The venue is null for an online event even when the row still holds one
 * from an earlier draft: a page saying "Online" beside a hall's name sends
 * somebody to the hall.
 *
 * @mixin Event
 */
class EventResource extends JsonResource
{
    use IncludesSeo;

    public function toArray(Request $request): array
    {
        return $this->row();
    }

    /** @return array<string, mixed> */
    protected function row(): array
    {
        /** @var Event $event */
        $event = $this->resource;
        $start = EventText::local($event->starts_at);
        $venue = $event->format->hasVenue();

        return [
            'id' => $event->id,
            'title' => $event->title,
            'slug' => $event->slug,
            'summary' => $event->summary,
            'format' => $event->format->value,
            'format_label' => $event->format->label(),
            'starts_at' => EventText::iso($event->starts_at),
            'ends_at' => EventText::iso($event->ends_at),
            'date_label' => EventText::dateLabel($event),
            'time_label' => EventText::timeLabel($event),
            // The date tile, in parts, so a card never slices a label.
            'day' => $start->format('j'),
            'month' => $start->format('M'),
            'year' => $start->format('Y'),
            'venue_name' => $venue ? $event->venue_name : null,
            'venue_city' => $venue ? $event->venue_city : null,
            'cover_image' => $event->cover_image_path ? asset('storage/'.$event->cover_image_path) : null,
            'cover_image_alt' => MediaMeta::alt($event->cover_image_path),
            'cover_image_focus' => MediaMeta::focus($event->cover_image_path),
            'is_featured' => (bool) $event->is_featured,
            'is_past' => $event->isPast(),
            'registration_mode' => $event->registration_mode->value,
            // The sitemap's `lastmod`: the record's own last change, never the build time.
            'updated_at' => EventText::iso($event->updated_at),
            // So the sitemap can honour `sitemap_include`; present when the relation is loaded.
            'seo' => $this->seo(),
        ];
    }
}
