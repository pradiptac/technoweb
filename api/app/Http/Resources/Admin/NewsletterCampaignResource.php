<?php

namespace App\Http\Resources\Admin;

use App\Models\NewsletterCampaign;
use App\Support\Newsletter\CampaignSender;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin NewsletterCampaign */
class NewsletterCampaignResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'subject' => $this->subject,
            'subject_b' => $this->subject_b,
            'ab_test_percent' => $this->ab_test_percent,
            'ab_wait_hours' => $this->ab_wait_hours,
            /*
             * The subject test's state, present only when there is one: the
             * winner once named, when the held remainder is due to go, and
             * sent/opened per subject so far. The console draws the "Decide
             * now" control from this rather than from a status of its own —
             * a campaign under test is still `sending`, which is the truth.
             */
            'ab' => $this->when($this->testsSubjects(), fn () => [
                'winner' => $this->ab_winner,
                'decided_at' => $this->ab_decided_at?->toIso8601String(),
                'decide_at' => $this->abDecideAt()?->toIso8601String(),
                'held' => $this->recipients()->where('status', 'held')->count(),
                'variants' => CampaignSender::variantStats($this->resource),
            ]),
            'preheader' => $this->preheader,
            'from_name' => $this->from_name,
            'from_email' => $this->from_email,
            'reply_to' => $this->reply_to,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'is_editable' => $this->status->isEditable(),
            'template_id' => $this->newsletter_template_id,
            'blocks' => $this->blocks ?? [],
            // The rendered HTML is deliberately absent from the index and
            // present on a detail read: it is tens of kilobytes and a list of
            // twenty campaigns has no use for twenty copies of it.
            'html_content' => $this->when($request->routeIs('*.show'), fn () => $this->html_content),
            'text_content' => $this->when($request->routeIs('*.show'), fn () => $this->text_content),
            'recipient_count' => $this->recipient_count,
            'health_score' => $this->health_score,
            'scheduled_at' => $this->scheduled_at?->toIso8601String(),
            'started_at' => $this->started_at?->toIso8601String(),
            'completed_at' => $this->completed_at?->toIso8601String(),
            'test_sent_at' => $this->test_sent_at?->toIso8601String(),
            'attachment_path' => $this->attachment_path,
            'attachment_name' => $this->attachment_name,
            'attachment_bytes' => $this->attachment_bytes,
            'attachment_url' => $this->attachment_path ? asset('storage/'.$this->attachment_path) : null,
            'created_at' => $this->created_at?->toIso8601String(),

            /*
             * How it performed, present only when the index counted it.
             *
             * Rates are worked out in the client from these four numbers rather
             * than sent as percentages, because a rate needs its denominator
             * beside it: 100% of two and 100% of two hundred are not the same
             * claim, which is the rule the dashboard already follows.
             */
            'performance' => $this->when(
                $this->recipients_count !== null,
                fn () => [
                    'recipients' => (int) $this->recipients_count,
                    'delivered' => (int) $this->delivered_count,
                    'opened' => (int) $this->opened_count,
                    'clicked' => (int) $this->clicked_count,
                    'bounced' => (int) $this->bounced_count,
                ],
            ),
            /*
             * The resend pair, on a detail read. `resend` is the one copy sent
             * to this campaign's non-openers, or null; `resend_of` is the
             * campaign this one was resent from, or null. The console draws
             * the "Resend to people who did not open" panel from the first
             * being null and the link home from the second.
             */
            'resend' => $this->whenLoaded('resend', fn () => $this->resend === null ? null : [
                'id' => $this->resend->id,
                'name' => $this->resend->name,
                'recipient_count' => $this->resend->recipient_count,
                'status' => $this->resend->status->value,
            ]),
            'resend_of' => $this->whenLoaded('resendOf', fn () => $this->resendOf === null ? null : [
                'id' => $this->resendOf->id,
                'name' => $this->resendOf->name,
            ]),
            /*
             * The sequence a step belongs to, on a detail read: null for an
             * ordinary campaign. The editor hides the Audience and Send tabs
             * on it and links back to the sequence rather than the list.
             */
            'sequence' => $this->whenLoaded('sequence', fn () => $this->sequence === null ? null : [
                'id' => $this->sequence->id,
                'name' => $this->sequence->name,
                'position' => $this->sequence_position,
                'delay_days' => $this->delay_days,
            ]),
            'group_ids' => $this->whenLoaded('groups', fn () => $this->groups->pluck('id')->values()),
            'groups' => $this->whenLoaded('groups', fn () => $this->groups->map(fn ($g) => [
                'id' => $g->id, 'name' => $g->name,
            ])->values()),
            'author' => $this->whenLoaded('author', fn () => $this->author?->name),
        ];
    }
}
