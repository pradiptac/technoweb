<?php

namespace App\Http\Resources\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A portal account as staff see it.
 *
 * Separate from `CustomerResource`, which is what a customer sees of
 * themselves: the fields that matter here — who approved it, why it was
 * turned down, whether the address was ever confirmed — are none of a
 * customer's business, and shipping one resource with conditional keys is how
 * the wrong half leaks.
 *
 * `email_verification_token` is absent and must stay absent. It is hashed at
 * rest, and a resource is the one place that would undo the point of that.
 */
class AdminCustomerResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'company' => $this->company,
            'phone' => $this->phone,

            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'status_note' => $this->status_note,

            'email_verified' => $this->email_verified_at !== null,
            'email_verified_at' => $this->email_verified_at?->toIso8601String(),

            'approved_at' => $this->approved_at?->toIso8601String(),
            'approved_by' => $this->whenLoaded('approver', fn () => $this->approver?->name),

            'ticket_count' => $this->whenCounted('tickets'),
            'last_login_at' => $this->last_login_at?->toIso8601String(),
            'created_at' => $this->created_at->toIso8601String(),
        ];
    }
}
