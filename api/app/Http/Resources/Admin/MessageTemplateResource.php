<?php

namespace App\Http\Resources\Admin;

use App\Models\MessageTemplate;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin MessageTemplate */
class MessageTemplateResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'channel' => $this->channel->value,
            'channel_label' => $this->channel->label(),
            'key' => $this->key,
            'name' => $this->name,
            'body' => $this->body,
            'header_text' => $this->header_text,
            'media_path' => $this->media_path,
            'media_url' => $this->mediaUrl(),
            'buttons' => array_values((array) ($this->buttons ?? [])),
            'push_title' => $this->push_title,
            'push_link' => $this->push_link,
            'category' => $this->category,
            'language' => $this->language,
            'provider_template_name' => $this->provider_template_name,
            'provider_template_id' => $this->provider_template_id,
            'approval_status' => $this->approval_status->value,
            'approval_label' => $this->approval_status->label(),
            'approval_reason' => $this->approval_reason,
            'sendable' => $this->sendable(),
            'placeholders' => $this->placeholderNames(),
            'submitted_at' => $this->submitted_at?->toIso8601String(),
            'synced_at' => $this->synced_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
