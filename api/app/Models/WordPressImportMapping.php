<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One source record's place here: WordPress post 42 on this site became
 * `blog_post` 7. See the 2026-09-27 migration.
 */
class WordPressImportMapping extends Model
{
    protected $table = 'wordpress_import_map';

    protected $fillable = [
        'site', 'source_type', 'source_id', 'target_type', 'target_id', 'source_url', 'wordpress_import_id',
    ];

    protected function casts(): array
    {
        return ['target_id' => 'integer'];
    }
}
