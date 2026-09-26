<?php

namespace App\Http\Resources\Store;

use App\Models\ProductReview;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A published review as the shop shows it.
 *
 * **No customer id, no address, no order.** The name is the snapshot taken
 * when it was written ("Neil B."), `verified` is one bit, and the variant is
 * the line's own label — structural, the lesson the ticket module's internal
 * notes taught, rather than fields somebody has to remember to strip.
 */
/** @mixin ProductReview */
class ReviewResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'display_name' => $this->display_name,
            'verified' => $this->isVerified(),
            'variant_label' => $this->variant_label,
            'rating' => (int) $this->rating,
            'title' => $this->title,
            'body' => $this->body,
            'published_at' => $this->published_at?->toIso8601String(),
        ];
    }
}
