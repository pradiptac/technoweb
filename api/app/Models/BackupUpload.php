<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One file of one backup on one destination, with where its upload got to —
 * so an upload far bigger than one run of the worker carries on from the
 * last chunk rather than starting again.
 *
 * @property array<string, mixed>|null $state
 */
class BackupUpload extends Model
{
    protected $fillable = [
        'backup_id', 'destination', 'file', 'size', 'status', 'bytes_sent', 'state', 'error', 'attempts', 'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'state' => 'array',
            'size' => 'integer',
            'bytes_sent' => 'integer',
            'attempts' => 'integer',
            'completed_at' => 'immutable_datetime',
        ];
    }

    /** @return BelongsTo<Backup, $this> */
    public function backup(): BelongsTo
    {
        return $this->belongsTo(Backup::class);
    }
}
