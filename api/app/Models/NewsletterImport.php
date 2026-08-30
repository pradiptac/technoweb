<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class NewsletterImport extends Model
{
    protected $fillable = [
        'uploaded_by', 'filename', 'status', 'mapping', 'total_rows',
        'imported', 'updated', 'invalid', 'duplicates', 'suppressed',
    ];

    protected function casts(): array
    {
        return ['mapping' => 'array'];
    }

    public function rows(): HasMany
    {
        return $this->hasMany(NewsletterImportRow::class);
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}
