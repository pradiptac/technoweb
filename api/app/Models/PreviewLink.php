<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * A private link to one draft (0.138.0, `docs/admin-console.md` "Draft share
 * links"). Whoever holds the token can read that record, signed out, until
 * `expires_at` or until staff revoke it.
 *
 * `token` is hidden: it is a credential, and the one place it is ever shown is
 * the `path` the staff resource builds from it.
 */
class PreviewLink extends Model
{
    protected $fillable = ['subject_type', 'subject_id', 'token', 'expires_at', 'created_by'];

    protected $hidden = ['token'];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'last_viewed_at' => 'datetime',
            'views' => 'integer',
        ];
    }

    /** @return MorphTo<Model, $this> */
    public function subject(): MorphTo
    {
        return $this->morphTo();
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }

    /** 64 lower-case hex characters, from the system's CSPRNG. */
    public static function newToken(): string
    {
        return bin2hex(random_bytes(32));
    }
}
