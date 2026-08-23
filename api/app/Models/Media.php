<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class Media extends Model
{
    protected $table = 'media';

    protected $fillable = ['uploaded_by', 'folder_id', 'disk', 'path', 'filename', 'mime', 'size', 'width', 'height', 'alt_text'];

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
