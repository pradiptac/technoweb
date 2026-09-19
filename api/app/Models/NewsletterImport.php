<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One import of subscribers — from a file, or from a mailbox scan.
 *
 * A file import is `pending → running → completed` inside one request. A
 * mailbox import is `pending → scanning → ready` across many queued slices,
 * then `running → completed` when its review is committed; `failed`,
 * `cancelled` and `expired` are the ways out. See the 2026-09-19 migration
 * for what each extra column carries.
 */
class NewsletterImport extends Model
{
    public const SOURCE_FILE = 'file';

    public const SOURCE_MAILBOX = 'mailbox';

    protected $fillable = [
        'uploaded_by', 'filename', 'source', 'file', 'status', 'mapping', 'progress', 'analysis',
        'total_rows', 'imported', 'updated', 'invalid', 'duplicates', 'suppressed', 'excluded',
        'error', 'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'mapping' => 'array',
            'progress' => 'array',
            'analysis' => 'array',
            'expires_at' => 'immutable_datetime',
        ];
    }

    /** @return HasMany<NewsletterImportRow, $this> */
    public function rows(): HasMany
    {
        return $this->hasMany(NewsletterImportRow::class);
    }

    /** @return BelongsTo<User, $this> */
    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function isMailbox(): bool
    {
        return $this->source === self::SOURCE_MAILBOX;
    }

    /** @param  Builder<static>  $query */
    public function scopeMailbox(Builder $query): void
    {
        $query->where('source', self::SOURCE_MAILBOX);
    }

    /**
     * A scan still being worked on. One at a time: two scans share one queue,
     * one review screen and, for a consent source, one token.
     *
     * @param  Builder<static>  $query
     */
    public function scopeInFlight(Builder $query): void
    {
        $query->whereIn('status', ['pending', 'scanning']);
    }
}
