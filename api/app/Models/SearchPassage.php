<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One passage of one published record, and its embedding (docs/semantic-search.md). Written by `Indexer` only. */
class SearchPassage extends Model
{
    protected $fillable = ['subject_type', 'subject_id', 'position', 'heading', 'text', 'hash', 'model', 'vector', 'embedded_at'];

    protected function casts(): array
    {
        return ['embedded_at' => 'datetime'];
    }
}
