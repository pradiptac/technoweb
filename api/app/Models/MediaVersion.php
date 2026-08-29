<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

/**
 * The bytes a media file had before an edit replaced them.
 *
 * Written by `App\Support\MediaHistory` immediately before any operation that
 * rewrites a file in place — crop, resize, rotate, flip, adjust, replace.
 *
 * The file is deleted with the row by a model event rather than in whichever
 * code path removed it, so it holds however a version goes away: pruned past
 * the cap, cascaded when its media row is force-deleted, or removed by hand in
 * a console. Same reasoning as `JobApplication`'s CV, and the same reason the
 * prune has to iterate rather than mass-delete.
 */
class MediaVersion extends Model
{
    protected $fillable = [
        'media_id', 'created_by', 'disk', 'path', 'mime', 'size', 'width', 'height', 'operation',
    ];

    protected function casts(): array
    {
        return [
            'media_id' => 'integer',
            'created_by' => 'integer',
            'size' => 'integer',
            'width' => 'integer',
            'height' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::deleting(function (MediaVersion $version) {
            // A version whose file outlives it is an orphan nothing can find:
            // no row points at it and it is not in the library's listing.
            Storage::disk($version->disk)->delete($version->path);
        });
    }

    public function media(): BelongsTo
    {
        return $this->belongsTo(Media::class);
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function url(): string
    {
        return Storage::disk($this->disk)->url($this->path);
    }
}
