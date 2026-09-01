<?php

namespace App\Http\Resources\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A lead, for the console.
 *
 * Admin only. There is no public counterpart and there must not be: this is a
 * list of everyone who has written in, with their telephone numbers and what
 * they are planning to spend.
 */
class LeadResource extends JsonResource
{
    private bool $detail = false;

    /**
     * The heavy half — the trail, the source submission, the sibling enquiries.
     *
     * Gated on an explicit call from the controller rather than on the route
     * name, which is the trap `ProductResource` documents and this project has
     * walked into anyway: a nested resource inherits its parent's route name,
     * so `routeIs('*.show')` is true for every row in a list.
     */
    public function withDetail(): static
    {
        $this->detail = true;

        return $this;
    }

    public function toArray(Request $request): array
    {
        $base = [
            'id' => $this->id,
            'channel' => $this->channel,
            'form_name' => $this->form_name,

            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'company' => $this->company,
            'subject' => $this->subject,
            'message' => $this->message,

            'source_url' => $this->source_url,
            'source_path' => $this->source_path,
            'source_title' => $this->source_title,
            'referrer' => $this->referrer,
            'utm_source' => $this->utm_source,
            'utm_medium' => $this->utm_medium,
            'utm_campaign' => $this->utm_campaign,

            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'is_open' => $this->status->isOpen(),
            'assigned_to' => $this->assigned_to,
            'assignee_name' => $this->whenLoaded('assignee', fn () => $this->assignee?->name),
            'follow_up_at' => $this->follow_up_at?->toIso8601String(),
            /*
             * Overdue is answered here rather than left to the browser, because
             * the list filters on it server-side and two answers to one word is
             * how the newsletter ended up reporting 3 delivered on one screen
             * and 4 on another.
             */
            'is_overdue' => (bool) ($this->status->isOpen() && $this->follow_up_at && $this->follow_up_at->isPast()),
            'value_paise' => $this->value_paise,
            'contacted_at' => $this->contacted_at?->toIso8601String(),
            'closed_at' => $this->closed_at?->toIso8601String(),

            'score' => $this->score,
            // Null rather than a number when nothing was ever measured: an
            // unscored backfilled lead is not a lead that scored zero, and the
            // console renders the difference.
            'score_band' => $this->score_band,
            'created_at' => $this->created_at?->toIso8601String(),
        ];

        if (! $this->detail) {
            return $base;
        }

        return [
            ...$base,
            // The moves this lead may make, so the console's dropdown offers
            // only what the API will accept.
            'allowed_next' => $this->status->allowedNext(),
            // The working behind the number. Carried on the record rather than
            // recomputed, so a figure and its reasons always describe the same
            // moment even after the rubric moves.
            'score_reasons' => $this->score_reasons,
            'ip_address' => $this->ip_address,
            'notes' => LeadNoteResource::collection($this->whenLoaded('notes')),
            /*
             * The full answers, for a form whose fields this table has no
             * columns for. `LeadIntake` guesses a name and an email off the
             * obvious keys and stops there, so for anything else this is the
             * only place the answer exists.
             */
            'submission' => $this->when(
                $this->relationLoaded('source') && $this->source && $this->channel === 'form',
                fn () => [
                    'form_slug' => $this->source->form_slug ?? null,
                    'data' => $this->source->data ?? null,
                ],
            ),
            /*
             * Everything else this address has sent.
             *
             * The useful half of deduplication without the destructive half:
             * nothing is merged, so the second message that says what they
             * actually want is still its own row, and the relationship is shown
             * instead of guessed at.
             */
            'related' => $this->siblings()->limit(10)->get()->map(fn ($l) => [
                'id' => $l->id,
                'subject' => $l->subject,
                'form_name' => $l->form_name,
                'status' => $l->status->value,
                'status_label' => $l->status->label(),
                'created_at' => $l->created_at?->toIso8601String(),
            ]),
        ];
    }
}
