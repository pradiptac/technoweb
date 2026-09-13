<?php

namespace App\Http\Resources\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class NewsletterSubscriberResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'email' => $this->email,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'name' => $this->name(),
            'company' => $this->company,
            'phone' => $this->phone,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'source' => $this->source,
            'customer_id' => $this->customer_id,
            'bounce_count' => $this->bounce_count,
            // Hunter's verdict, and the raw word it used, so the badge can
            // say "Verified (webmail)" without a second lookup.
            'verification' => $this->verification->value,
            'verification_label' => $this->verification->label(),
            'verification_result' => $this->verification_result,
            'verification_score' => $this->verification_score,
            'verification_attempts' => $this->verification_attempts,
            'verification_at' => $this->verification_at?->toIso8601String(),
            'subscribed_at' => $this->subscribed_at?->toIso8601String(),
            'unsubscribed_at' => $this->unsubscribed_at?->toIso8601String(),
            'groups' => $this->whenLoaded('groups', fn () => $this->groups->map(fn ($g) => [
                'id' => $g->id, 'name' => $g->name,
            ])->values()),
            /*
             * Whether this address is on the do-not-mail list, which is a
             * different fact from the status and can disagree with it: a row
             * imported after somebody unsubscribed is `active` and still
             * unmailable. The console shows both, because showing only the
             * status would explain neither why they are excluded nor how to
             * put it right.
             */
            'suppressed' => $this->when(
                $this->resource->relationLoaded('suppression') || isset($this->suppressed),
                fn () => (bool) $this->suppressed,
            ),
        ];
    }
}
