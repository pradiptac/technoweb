<?php

namespace App\Http\Resources\Admin;

use App\Models\Client;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A client as the console edits it. Path and URL both, the `CoverField` rule.
 *
 * @mixin Client
 */
class ClientResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'logo_path' => $this->logo_path,
            'logo' => filled($this->logo_path)
                ? asset('storage/'.$this->logo_path).'?v='.($this->updated_at?->timestamp ?? 0)
                : null,
            'website_url' => $this->website_url,
            'industry_id' => $this->industry_id,
            'industry' => $this->whenLoaded('industry', fn () => $this->industry?->name),
            'note' => $this->note,
            'is_featured' => (bool) $this->is_featured,
            'status' => $this->status?->value,
            'sort_order' => (int) $this->sort_order,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
