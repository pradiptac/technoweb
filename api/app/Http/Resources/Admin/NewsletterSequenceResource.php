<?php

namespace App\Http\Resources\Admin;

use App\Models\NewsletterCampaign;
use App\Models\NewsletterSequence;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin NewsletterSequence */
class NewsletterSequenceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'newsletter_group_id' => $this->newsletter_group_id,
            'group' => $this->whenLoaded('group', fn () => $this->group === null ? null : [
                'id' => $this->group->id, 'name' => $this->group->name,
            ]),
            'from_name' => $this->from_name,
            'from_email' => $this->from_email,
            'reply_to' => $this->reply_to,
            'author' => $this->whenLoaded('author', fn () => $this->author?->name),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),

            // Counted by the index; on a detail read the steps are listed
            // and the enrolments counted per status. Read through
            // `getAttribute`: they are aggregates the query attached, not
            // columns the model declares.
            'steps_count' => $this->when($this->resource->getAttribute('steps_count') !== null, fn () => (int) $this->resource->getAttribute('steps_count')),
            'active_enrolments' => $this->when($this->resource->getAttribute('active_enrolments') !== null, fn () => (int) $this->resource->getAttribute('active_enrolments')),

            /*
             * The steps, in order. Each is a campaign row; the console links
             * to the campaign editor for its content and edits the delay
             * here. `blocking` is what the runner will hold on — the check
             * that fails, named, so a step that will never go out says so
             * on the list rather than in a log.
             */
            'steps' => $this->whenLoaded('steps', fn () => $this->steps->map(fn (NewsletterCampaign $c) => [
                'id' => $c->id,
                'position' => $c->sequence_position,
                'subject' => $c->subject,
                'name' => $c->name,
                'delay_days' => $c->delay_days,
                'health_score' => $c->health_score,
                'sent_count' => (int) ($c->getAttribute('sent_count') ?? 0),
                'updated_at' => $c->updated_at?->toIso8601String(),
            ])->values()),

            'enrolments' => $this->when($this->resource->getAttribute('enrolment_counts') !== null, fn () => $this->resource->getAttribute('enrolment_counts')),
        ];
    }
}
