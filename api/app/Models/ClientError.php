<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * A JavaScript failure, as reported by the browser it happened in.
 *
 * One row per distinct bug, not per occurrence. See the migration for why.
 */
class ClientError extends Model
{
    protected $fillable = [
        'fingerprint', 'area', 'message', 'digest', 'path', 'user_agent',
        'occurrences', 'first_seen_at', 'last_seen_at', 'resolved_at',
    ];

    protected function casts(): array
    {
        return [
            'first_seen_at' => 'datetime',
            'last_seen_at' => 'datetime',
            'resolved_at' => 'datetime',
        ];
    }

    public function scopeUnresolved(Builder $query): Builder
    {
        return $query->whereNull('resolved_at');
    }

    /**
     * Record one report, collapsing it onto the bug it belongs to.
     *
     * An upsert on the unique fingerprint rather than a read-then-write: the
     * read-then-write version passes every test written on one thread and is a
     * race the moment two browsers hit the same bug together, which for a bug
     * worth knowing about is the normal case rather than the edge one. Same
     * reasoning as the payment webhook's unique index.
     *
     * **A recurrence re-opens it.** `resolved_at` is cleared on every report,
     * so a fix that did not hold says so by itself instead of staying ticked
     * off while the thing keeps happening.
     *
     * Everything is truncated here rather than trusted: this is a public
     * endpoint and the fields are whatever a browser sent.
     */
    public static function report(string $area, string $message, ?string $digest, ?string $path, ?string $userAgent): void
    {
        $message = Str::limit(trim($message), 2000, '');

        if ($message === '') {
            return;
        }

        $fingerprint = hash('sha256', $area.'|'.$message.'|'.($digest ?? ''));
        $now = now();

        static::query()->upsert(
            [[
                'fingerprint' => $fingerprint,
                'area' => $area,
                'message' => $message,
                'digest' => $digest !== null ? Str::limit($digest, 64, '') : null,
                'path' => $path !== null ? Str::limit($path, 512, '') : null,
                'user_agent' => $userAgent !== null ? Str::limit($userAgent, 512, '') : null,
                'occurrences' => 1,
                'first_seen_at' => $now,
                'last_seen_at' => $now,
                'resolved_at' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ]],
            ['fingerprint'],
            /*
             * On a repeat: bump the count, move `last_seen_at`, re-open it, and
             * refresh the path — the newest occurrence is the more useful one to
             * reproduce from. `first_seen_at` is deliberately absent, because
             * "when did this start" is the question that dates it to a deploy
             * and an update would destroy it.
             */
            [
                'occurrences' => DB::raw('occurrences + 1'),
                'last_seen_at' => $now,
                'resolved_at' => null,
                'updated_at' => $now,
                // A bare column name, which Laravel compiles to the driver's own
                // "take the incoming value" form. Writing `VALUES(path)` by hand
                // would be MySQL 5.7 syntax that 8.0.20 deprecates and warns on.
                'path',
            ],
        );
    }
}
