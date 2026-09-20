<?php

namespace App\Http\Resources\Admin;

use App\Enums\WebhookEvent;
use App\Models\Webhook;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A webhook as the console sees it.
 *
 * **`secret` is never here.** It is returned once, by the controller, on the
 * response that created or rotated it — added beside this array the way
 * `generated_password` rides on a new staff account — and a resource that
 * carried it would put it on every list and every edit screen. `has_secret`
 * is the most this says.
 */
/** @mixin Webhook */
class WebhookResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $events = array_values(array_filter((array) $this->events, 'is_string'));

        return [
            'id' => $this->id,
            'name' => $this->name,
            'url' => $this->url,
            'events' => $events,
            'event_labels' => array_map(
                fn (string $e) => WebhookEvent::tryFrom($e)?->label() ?? $e,
                $events,
            ),
            'is_active' => (bool) $this->is_active,
            'has_secret' => filled($this->secret),
            'created_by' => $this->whenLoaded('creator', fn () => $this->creator?->name),
            'last_delivered_at' => $this->last_delivered_at?->toIso8601String(),
            'last_error' => $this->last_error,
            'deliveries_count' => $this->whenCounted('deliveries'),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
