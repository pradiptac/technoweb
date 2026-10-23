<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One call made with a key: kept for the key's usage screen, never its body. */
class ApiKeyRequest extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['api_key_id', 'method', 'path', 'status', 'ip', 'duration_ms'];

    /** @return BelongsTo<ApiKey, $this> */
    public function apiKey(): BelongsTo
    {
        return $this->belongsTo(ApiKey::class);
    }
}
