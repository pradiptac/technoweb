<?php

namespace App\Http\Resources\Admin;

use App\Models\EventRegistration;
use App\Support\Events\EventText;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One registration, as the desk reads it.
 *
 * **The token is in no admin response.** It is what lets a registrant
 * cancel from their own link, and a console that showed it would be a
 * console from which anybody on the desk could do that in their name.
 * `token` is `$hidden` on the model and this class does not name it.
 *
 * `lead_path` is a console path beside the id — the registrations screen
 * links to the pipeline record, and a path lets the browser supply the
 * origin.
 *
 * This is also the body of the `event.registered` webhook, less
 * `staff_note` and `allowed_next` (`WebhookPayload::eventRegistration()`) —
 * the first is the desk's, the second is a console affordance.
 *
 * @mixin EventRegistration
 */
class EventRegistrationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        /** @var EventRegistration $registration */
        $registration = $this->resource;

        return [
            'id' => $registration->id,
            'event_id' => $registration->event_id,
            'name' => $registration->name,
            'email' => $registration->email,
            'phone' => $registration->phone,
            'company' => $registration->company,
            'seats' => (int) $registration->seats,
            'note' => $registration->note,
            'staff_note' => $registration->staff_note,
            'status' => $registration->status->value,
            'status_label' => $registration->status->label(),
            /*
             * What the status select may offer for this row right now,
             * itself first. Read from the loaded event, never lazily: every
             * controller that builds one of these sets the relation, and a
             * row built without it carries no key rather than a guess.
             */
            'allowed_next' => $this->when(
                $registration->relationLoaded('event') && $registration->event !== null,
                fn () => $registration->status->allowedNext($registration->event->hasStarted()),
            ),
            'customer_id' => $registration->customer_id,
            'lead_id' => $registration->lead_id,
            'lead_path' => $registration->lead_id ? '/admin/leads/'.$registration->lead_id : null,
            'source' => $registration->source,
            'reminded_at' => EventText::iso($registration->reminded_at),
            'cancelled_at' => EventText::iso($registration->cancelled_at),
            'created_at' => EventText::iso($registration->created_at),
        ];
    }
}
