<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A visitor's normalised search phrase, embedded once and kept 30 days (docs/semantic-search.md). */
class SearchQueryVector extends Model
{
    public $timestamps = false;

    public $incrementing = false;

    protected $primaryKey = 'hash';

    protected $keyType = 'string';

    protected $fillable = ['hash', 'model', 'vector', 'last_used_at'];

    protected function casts(): array
    {
        return ['last_used_at' => 'datetime'];
    }
}
