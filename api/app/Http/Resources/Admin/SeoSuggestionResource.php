<?php

namespace App\Http\Resources\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One stored suggestion, as the console reads it.
 *
 * `result` goes out as it was stored, which is safe because it was whitelisted
 * key by key on the way in — see `SeoAssistant::validate()`. Nothing the model
 * returned that we did not ask for was ever written, so nothing unexpected can
 * be rendered.
 *
 * The actor is sent as a **name**, not a relation. The account can be deleted
 * and the record of who asked must survive it — the rule the activity log
 * follows by copying its actor rather than joining one.
 */
class SeoSuggestionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'action' => $this->action?->value,
            'action_label' => $this->action?->label(),
            'model' => $this->model,
            'status' => $this->status?->value,
            'status_label' => $this->status?->label(),
            'result' => $this->result,
            'tokens' => $this->tokens,
            'asked_by' => $this->whenLoaded('user', fn () => $this->user?->name),
            'decided_by' => $this->whenLoaded('decider', fn () => $this->decider?->name),
            'decided_at' => $this->decided_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
