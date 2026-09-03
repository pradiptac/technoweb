<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CustomerResource extends JsonResource
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
            'email_verified' => $this->email_verified_at !== null,

            /*
             * What the last checkout used, so the next one can be prefilled.
             *
             * Safe on this resource specifically: it is what a customer sees
             * of *themselves* — `/auth/me` and the profile screen — and these
             * are their own address and their own GSTIN. `status_note` stays
             * absent for the opposite reason: that one is a judgement about
             * them, written for colleagues.
             */
            'billing_address' => $this->billing_address,
            'shipping_address' => $this->shipping_address,
            'gstin' => $this->gstin,
        ];
    }
}
