<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NewsletterTemplate extends Model
{
    protected $fillable = [
        'name', 'slug', 'description', 'category', 'blocks', 'html',
        'thumbnail_path', 'is_system',
    ];

    protected function casts(): array
    {
        return [
            /*
             * A plain array cast, which is correct here and would not be for
             * anything key-shaped: MySQL reorders JSON *object* keys, which is
             * the bug `App\Casts\SpecSheet` exists for. Blocks are an ordered
             * list, and JSON arrays preserve their order.
             */
            'blocks' => 'array',
            'is_system' => 'boolean',
        ];
    }
}
