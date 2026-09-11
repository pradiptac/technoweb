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
            /*
             * Public, unlike `notify_email` beside it, and it has to be.
             *
             * `/embed/forms/{slug}` refuses a form that has not opted in, and
             * that page reads the same public endpoint every other caller
             * does — so the flag has to cross the wire or the refusal cannot
             * be made. It says nothing a visitor could not learn by trying the
             * URL, which is the test for whether something belongs on this
             * resource: the notify address fails it, this does not.
             */
            'embed_enabled' => (bool) $this->embed_enabled,
            'fields' => FormFieldResource::collection($this->whenLoaded('fields')),
            'fields_count' => $this->whenCounted('fields'),
            'submissions_count' => $this->whenCounted('submissions'),
        ];
    }
}
