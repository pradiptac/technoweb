<?php

namespace App\Http\Resources\Admin;

use App\Enums\ApiScope;
use App\Models\ApiKey;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * An API key as the console sees it. **Neither the key nor its hash is ever
 * here**: the plain key is added beside this array by the controller on the
 * response that made or rolled it, and nowhere else.
 */
/** @mixin ApiKey */
class ApiKeyResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $scopes = array_values((array) $this->scopes);

        return [
            'id' => $this->id,
            'name' => $this->name,
            'prefix' => $this->prefix,
            'scopes' => $scopes,
            'scope_labels' => array_map(fn (string $s) => ApiScope::tryFrom($s)?->label() ?? $s, $scopes),
            'expires_at' => $this->expires_at?->toIso8601String(),
            'is_expired' => $this->isExpired(),
            'revoked_at' => $this->revoked_at?->toIso8601String(),
            'status' => $this->status(),
            'allowed_ips' => array_values((array) $this->allowed_ips),
            'last_used_at' => $this->last_used_at?->toIso8601String(),
            'last_used_ip' => $this->last_used_ip,
            'created_by' => $this->whenLoaded('creator', fn () => $this->creator?->name),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            'requests_30d' => $this->whenCounted('requests_30d'),
        ];
    }
}
