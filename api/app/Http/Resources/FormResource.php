<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FormResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'status' => $this->status?->value,
            'submit_label' => $this->submit_label,
            'success_message' => $this->success_message,
            // Only for staff. Publishing this on the public endpoint would
            // hand a spammer the address every submission lands in, so it is
            // gated on the request being an authenticated admin one rather
            // than on remembering to strip it.
            'notify_email' => $this->when(
                $request->user() !== null && $request->is('api/v1/admin/*'),
                fn () => $this->notify_email,
            ),
            'fields' => FormFieldResource::collection($this->whenLoaded('fields')),
            'fields_count' => $this->whenCounted('fields'),
            'submissions_count' => $this->whenCounted('submissions'),
        ];
    }
}
