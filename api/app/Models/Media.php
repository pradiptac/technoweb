<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Storage;

class Media extends Model
{
    /**
     * Deleting a file keeps the row **and the bytes**.
     *
     * Nothing in this product tracks which records reference a path, so the
     * delete dialog has always had to admit it cannot say what it will break —
     * which means the mistake is found by somebody opening a page and seeing a
     * hole in it, long after the click. A bin turns that from unrecoverable
     * into a restore. `forceDelete` is what actually removes the file, and it
     * is a separate, deliberate action.
     */
    use SoftDeletes;

    protected $table = 'media';

    protected $fillable = [
        'uploaded_by', 'folder_id', 'disk', 'path', 'filename', 'mime', 'size',
        'width', 'height', 'alt_text', 'description', 'tags',
    ];

    /**
     * Multipart fields arrive as strings, so an upload response reported
     * folder_id as "4" while every read of the same row reported 4. A client
     * comparing the two got a mismatch that depended on how the row had been
     * fetched.
     */
    protected function casts(): array
    {
        return [
            'folder_id' => 'integer',
            'uploaded_by' => 'integer',
            'size' => 'integer',
            'width' => 'integer',
            'height' => 'integer',
            /*
             * A plain array cast, which is right *here* and wrong for a map.
             *
             * MySQL's JSON type normalises object keys by length and then
             * alphabetically — the bug `App\Casts\SpecSheet` exists for. JSON
             * *arrays* preserve their order, so a list of tags comes back in
             * the order it was entered. Reach for SpecSheet the moment
             * something key-shaped and order-sensitive lands in a JSON column.
             */
            'tags' => 'array',
        ];
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function folder(): BelongsTo
    {
        return $this->belongsTo(MediaFolder::class, 'folder_id');
    }

    /** Superseded copies, newest first. See App\Support\MediaHistory. */
    public function versions(): HasMany
    {
        return $this->hasMany(MediaVersion::class)->orderByDesc('id');
    }

    /** Whether this is something the library can show as a picture. */
    public function isImage(): bool
    {
        return str_starts_with((string) $this->mime, 'image/');
    }

    public function url(): string
    {
        return Storage::disk($this->disk)->url($this->path);
    }
}
