<?php

namespace App\Http\Resources;

use App\Models\Event;
use App\Models\EventRegistration;
use App\Support\Events\EventText;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A registration as its registrant sees it, from their manage link.
 *
 * **No email, no phone, no note, no staff field, no token.** The page is
 * addressed by a link — one that may be forwarded, left open on a shared
 * screen, or sit in a browser's history — so it shows only what somebody
 * needs to recognise their registration and decide whether to cancel it:
 * the name, the seats, the status and the event.
 *
 * `can_cancel` says whether the button would be accepted, so the page never
 * offers one that answers 422.
 *
 * @mixin EventRegistration
 */
class EventRegistrationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        /** @var EventRegistration $registration */
        $registration = $this->resource;
        /** @var Event $event */
        $event = $registration->event;
        $venue = $event->format->hasVenue();

        return [
            'status' => $registration->status->value,
            'status_label' => $registration->status->label(),
            'seats' => (int) $registration->seats,
            'name' => $registration->name,
            'can_cancel' => $registration->status->isActive() && ! $event->hasStarted(),
            'event' => [
                'title' => $event->title,
                'slug' => $event->slug,
                'date_label' => EventText::dateLabel($event),
                'time_label' => EventText::timeLabel($event),
                'format' => $event->format->value,
                'format_label' => $event->format->label(),
                'venue_name' => $venue ? $event->venue_name : null,
                'venue_address' => $venue ? $event->venue_address : null,
                'is_past' => $event->isPast(),
                'calendar_path' => $event->publicPath().'/calendar',
            ],
        ];
    }
}
