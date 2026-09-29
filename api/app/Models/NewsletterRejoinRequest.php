<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/**
 * An unsubscribed address asking to come back, and — once confirmed — the
 * record that the person reversed their own decision. See the migration and
 * `App\Support\Newsletter\Rejoin`.
 */
class NewsletterRejoinRequest extends Model
{
    protected $fillable = ['email', 'token_hash', 'group_ids', 'details', 'expires_at', 'confirmed_at'];

    protected function casts(): array
    {
        return [
            'group_ids' => 'array',
            'details' => 'array',
            'expires_at' => 'immutable_datetime',
            'confirmed_at' => 'immutable_datetime',
        ];
    }

    protected static function booted(): void
    {
        static::saving(function (self $row) {
            $row->email = Str::lower(trim($row->email));
        });
    }

    public static function hash(string $token): string
    {
        return hash('sha256', $token);
    }
}
