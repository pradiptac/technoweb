<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * One restore, from a backup this server remembers or from a folder found
 * on a destination. See `docs/backups.md`.
 *
 * @property array{kind: string, destination?: string, folder: string, from?: string|null} $source
 * @property list<array<string, mixed>>|null $chain the manifests, the full first
 * @property array<string, mixed>|null $progress
 */
class BackupRestore extends Model
{
    public const IN_FLIGHT = ['pending', 'safety', 'downloading', 'importing', 'files', 'finishing'];

    public const SCOPES = ['database', 'files', 'both'];

    protected $fillable = [
        'backup_id', 'source', 'chain', 'scope', 'prune_missing', 'status', 'progress', 'safety_backup_id',
        'error', 'created_by', 'created_by_name', 'started_at', 'finished_at',
    ];

    protected function casts(): array
    {
        return [
            'source' => 'array',
            'chain' => 'array',
            'progress' => 'array',
            'prune_missing' => 'boolean',
            'started_at' => 'immutable_datetime',
            'finished_at' => 'immutable_datetime',
        ];
    }

    /** @param  Builder<static>  $query */
    public function scopeInFlight(Builder $query): void
    {
        $query->whereIn('status', self::IN_FLIGHT);
    }

    public function restoresDatabase(): bool
    {
        return in_array($this->scope, ['database', 'both'], true);
    }

    public function restoresFiles(): bool
    {
        return in_array($this->scope, ['files', 'both'], true);
    }
}
