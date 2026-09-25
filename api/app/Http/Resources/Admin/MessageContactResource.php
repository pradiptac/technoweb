<?php

namespace App\Http\Resources\Admin;

use App\Models\MessageContact;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A contact as the console lists it. A push token is shortened — it is
 * 160 characters of nothing a person can use, and the whole of it is a
 * credential for that browser.
 *
 * @mixin MessageContact
 */
class MessageContactResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $token = $this->channel->addressKind() === 'token';

        return [
            'id' => $this->id,
            'channel' => $this->channel->value,
            'channel_label' => $this->channel->label(),
            'address' => $token ? mb_substr($this->address, 0, 12).'…' : $this->address,
            'name' => $this->name,
            'customer' => $this->whenLoaded('customer', fn () => $this->customer === null ? null : [
                'id' => $this->customer->id,
                'name' => $this->customer->name,
                'email' => $this->customer->email,
            ]),
            'source' => $this->source,
            'is_active' => $this->isActive(),
            'opted_in_at' => $this->opted_in_at?->toIso8601String(),
            'opted_out_at' => $this->opted_out_at?->toIso8601String(),
            'opt_out_reason' => $this->opt_out_reason,
            'last_sent_at' => $this->last_sent_at?->toIso8601String(),
        ];
    }
}
