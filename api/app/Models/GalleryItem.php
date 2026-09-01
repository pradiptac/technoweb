<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GalleryItem extends Model
{
    /** @var list<string> */
    protected $fillable = [
        'gallery_id', 'gallery_group_id', 'media_path', 'alt_text',
        'title', 'subtitle', 'link_url', 'sort_order',
    ];

    protected function casts(): array
    {
        return ['sort_order' => 'integer'];
    }

    public function gallery(): BelongsTo
    {
        return $this->belongsTo(Gallery::class);
    }

    public function group(): BelongsTo
    {
        return $this->belongsTo(GalleryGroup::class, 'gallery_group_id');
    }
}
