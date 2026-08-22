<?php

namespace App\Http\Resources\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * `owner_type` is the morph key ("solution"), not a class name — that is what
 * the morph map stores and what the owner picker sends back.
 */
class FaqResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'question' => $this->question,
            'answer' => $this->answer,
            'sort_order' => (int) $this->sort_order,
            'owner_type' => $this->faqable_type,
            'owner_id' => $this->faqable_id,
            // Read through the relation inside the closure, not from a
            // whenLoaded() value captured above — that returns a MissingValue
            // placeholder when the relation is absent, and ?->title on it
            // quietly yields null instead of the name.
            //
            // Null here means the owner is gone. That should not happen — every
            // destroy takes its FAQs with it — but a row pointing at nothing is
            // exactly what an editor needs to be able to see and delete, so it
            // is labelled rather than hidden.
            'owner_name' => $this->whenLoaded(
                'faqable',
                fn () => $this->faqable?->title ?? $this->faqable?->name,
            ),
            'owner_missing' => $this->whenLoaded('faqable', fn () => $this->faqable === null),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
