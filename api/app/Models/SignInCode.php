<?php

namespace App\Models;

use App\Enums\SignInAudience;
use Illuminate\Database\Eloquent\Model;

/**
 * A one-time sign-in code.
 *
 * Deliberately thin: everything that decides whether a code is any good lives
 * in `App\Support\SignInCodes`, because those rules — the expiry, the attempt
 * cap, and the conditional consume that makes it single-use — have to be
 * applied identically by both audiences and are the whole of the security
 * here. A model with a `isValid()` helper invites a second caller that checks
 * two of the three.
 */
class SignInCode extends Model
{
    protected $fillable = [
        'audience', 'email', 'code_hash', 'attempts', 'ip', 'sent_at', 'expires_at', 'consumed_at',
    ];

    /** Never serialised anywhere, but a hash has no business in a dump either. */
    protected $hidden = ['code_hash'];

    protected function casts(): array
    {
        return [
            'audience' => SignInAudience::class,
            'attempts' => 'integer',
            'sent_at' => 'datetime',
            'expires_at' => 'datetime',
            'consumed_at' => 'datetime',
        ];
    }
}
