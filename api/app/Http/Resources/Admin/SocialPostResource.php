<?php

namespace App\Http\Resources\Admin;

use App\Enums\SocialNetwork;
use App\Models\BlogPost;
use App\Models\CaseStudy;
use App\Models\Entry;
use App\Models\Event;
use App\Models\SocialPost;
use App\Support\Social\SocialSubjects;
use App\Support\Social\SocialText;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A social post as the review screen reads it (C7). Never a token: the
 * network's own id (`remote_id`) is not sent either, only the live address.
 * Load `subject`, `drafter` and `approver` before serialising a list
 * (`preventLazyLoading`).
 *
 * @mixin SocialPost
 */
class SocialPostResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $subject = $this->subject;
        $isX = $this->network === SocialNetwork::X;

        return [
            'id' => $this->id,
            'network' => $this->network->value,
            'network_label' => $this->network->label(),
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'text' => $this->text,
            'url' => $this->url,
            'source' => $this->source,
            'ai_pending' => $this->ai_pending,
            // What X will count once the site appends a space and the link.
            'x_length' => $isX ? SocialText::xLength((string) $this->text) + 1 + SocialText::X_URL : null,
            'limit' => $this->network->limit(),
            'drafted_by' => $this->drafter?->name,
            'approved_by' => $this->approver?->name,
            'approved_at' => $this->approved_at?->toIso8601String(),
            'sent_at' => $this->sent_at?->toIso8601String(),
            'remote_url' => $this->remote_url,
            'error' => $this->error,
            'created_at' => $this->created_at?->toIso8601String(),
            'subject' => $subject instanceof BlogPost || $subject instanceof CaseStudy || $subject instanceof Event || $subject instanceof Entry ? [
                'type' => $this->subject_type,
                'id' => $subject->getKey(),
                'title' => SocialSubjects::title($subject),
                'kind' => SocialSubjects::kindLabel($subject),
                'admin_path' => SocialSubjects::adminPath($subject),
                'public_url' => SocialSubjects::publicUrl($subject),
                'image' => $subject->defaultSeo()['og_image'] ?? null,
            ] : null,
        ];
    }
}
