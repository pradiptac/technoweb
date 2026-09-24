<?php

namespace App\Http\Resources;

use App\Models\Client;
use App\Support\MediaMeta;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A client on the logo wall. `logo_path` never appears here.
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
            'logo' => filled($this->logo_path) ? asset('storage/'.$this->logo_path) : null,
            'logo_alt' => MediaMeta::alt($this->logo_path) ?: $this->name,
            'logo_focus' => MediaMeta::focus($this->logo_path),
            'website_url' => $this->website_url,
            'note' => $this->note,
            'is_featured' => (bool) $this->is_featured,
            'industry' => $this->whenLoaded('industry', fn () => $this->industry ? [
                'id' => $this->industry->id,
                'name' => $this->industry->name,
                'slug' => $this->industry->slug,
            ] : null),
        ];
    }
}
