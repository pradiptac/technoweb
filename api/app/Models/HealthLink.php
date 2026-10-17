<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One URL some record links to, and what it answered last (docs/health.md "Link checker"). */
class HealthLink extends Model
{
    public const DEAD_AFTER = 2;

    protected $fillable = ['url_hash', 'url', 'host', 'internal', 'status', 'result', 'fails', 'checked_at', 'next_check_at'];

    protected function casts(): array
    {
        return [
            'internal' => 'boolean',
            'checked_at' => 'datetime',
            'next_check_at' => 'datetime',
        ];
    }

    public static function hashOf(string $url): string
    {
        return sha1($url);
    }

    /** Dead: an external URL that failed twice in a row, or an internal one that failed once — our own site's 404 is decisive. */
    public function isDead(): bool
    {
        return $this->result === 'failed' && ($this->internal || $this->fails >= self::DEAD_AFTER);
    }
}
