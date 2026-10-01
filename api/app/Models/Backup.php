<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One backup: a full, or an incremental that builds on a full and the
 * backups between. See the 2026-09-27 migration for the columns and
 * `docs/backups.md` for the whole flow.
 *
 * @property array<string, bool> $includes
 * @property list<string> $destinations
 * @property array<string, mixed>|null $progress
 * @property list<array{name: string, size: int, sha256: string}>|null $files
 */
class Backup extends Model
{
    public const FULL = 'full';

    public const INCREMENTAL = 'incremental';

    /** Being worked on by the backup worker. */
    public const IN_FLIGHT = ['pending', 'dumping', 'indexing', 'archiving', 'uploading'];

    /**
     * A copy of the database taken by the application itself, just before a
     * restore or an update replaces it: never a link in a chain, never on the
     * schedule's figures, kept for fourteen days, and driven by whatever took
     * it rather than by the backup worker.
     */
    public const SAFETY_TRIGGERS = ['pre_restore', 'pre_update'];

    /** Finished with everything it set out to hold, on at least this server. */
    public const DONE = ['completed', 'completed_with_errors'];

    protected $fillable = [
        'uuid', 'type', 'trigger', 'status', 'base_id', 'parent_id', 'folder', 'includes', 'destinations',
        'progress', 'dumper', 'db_bytes', 'file_count', 'files_bytes', 'deleted_count', 'files', 'total_bytes',
        'schema', 'error', 'created_by', 'created_by_name', 'started_at', 'finished_at', 'local_deleted_at',
    ];

    protected function casts(): array
    {
        return [
            'includes' => 'array',
            'destinations' => 'array',
            'progress' => 'array',
            'files' => 'array',
            'db_bytes' => 'integer',
            'file_count' => 'integer',
            'files_bytes' => 'integer',
            'deleted_count' => 'integer',
            'total_bytes' => 'integer',
            'started_at' => 'immutable_datetime',
            'finished_at' => 'immutable_datetime',
            'local_deleted_at' => 'immutable_datetime',
        ];
    }

    /** @return HasMany<BackupUpload, $this> */
    public function uploads(): HasMany
    {
        return $this->hasMany(BackupUpload::class);
    }

    /** @return BelongsTo<Backup, $this> */
    public function base(): BelongsTo
    {
        return $this->belongsTo(Backup::class, 'base_id');
    }

    /** @return BelongsTo<Backup, $this> */
    public function parent(): BelongsTo
    {
        return $this->belongsTo(Backup::class, 'parent_id');
    }

    /** @param  Builder<static>  $query */
    public function scopeInFlight(Builder $query): void
    {
        $query->whereIn('status', self::IN_FLIGHT);
    }

    /** @param  Builder<static>  $query */
    public function scopeDone(Builder $query): void
    {
        $query->whereIn('status', self::DONE);
    }

    public function isFull(): bool
    {
        return $this->type === self::FULL;
    }

    public function includes(string $what): bool
    {
        return (bool) (($this->includes ?? [])[$what] ?? false);
    }

    /** The chain's full: itself for a full. */
    public function baseId(): int
    {
        return $this->isFull() ? $this->id : (int) $this->base_id;
    }

    /**
     * Every backup a restore of this one needs, the full first.
     *
     * @return list<Backup>
     */
    public function chain(): array
    {
        $chain = [];
        $cursor = $this;

        while ($cursor !== null) {
            array_unshift($chain, $cursor);

            if ($cursor->isFull() || $cursor->parent_id === null) {
                break;
            }

            $cursor = self::query()->find($cursor->parent_id);
        }

        return $chain;
    }

    /**
     * Where this backup can be restored from: each destination every link in
     * its chain reached, plus `local` when every file is still on this server.
     *
     * @return list<string>
     */
    public function restorableFrom(): array
    {
        $chain = $this->chain();

        if ($chain === [] || ! $chain[0]->isFull()) {
            return [];
        }

        $sets = array_map(fn (Backup $b) => $b->reachedDestinations(), $chain);
        $common = array_values(array_intersect(...$sets));

        return $common;
    }

    /** @return list<string> the destinations holding every file, and `local` when this server still does */
    public function reachedDestinations(): array
    {
        if (! in_array($this->status, self::DONE, true)) {
            return [];
        }

        $uploads = $this->relationLoaded('uploads') ? $this->uploads : $this->uploads()->get();
        $reached = [];

        foreach ($uploads->groupBy('destination') as $destination => $rows) {
            if ($rows->every(fn (BackupUpload $u) => $u->status === 'done')) {
                $reached[] = (string) $destination;
            }
        }

        if ($this->local_deleted_at === null) {
            $reached[] = 'local';
        }

        return $reached;
    }
}
