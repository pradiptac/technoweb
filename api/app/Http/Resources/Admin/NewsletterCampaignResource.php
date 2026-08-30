<?php

namespace App\Http\Resources\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class NewsletterCampaignResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'subject' => $this->subject,
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
            'group_ids' => $this->whenLoaded('groups', fn () => $this->groups->pluck('id')->values()),
            'groups' => $this->whenLoaded('groups', fn () => $this->groups->map(fn ($g) => [
                'id' => $g->id, 'name' => $g->name,
            ])->values()),
            'author' => $this->whenLoaded('author', fn () => $this->author?->name),
        ];
    }
}
