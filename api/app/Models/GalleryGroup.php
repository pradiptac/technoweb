<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One tab in a gallery's strip.
 *
 * `slug` is unique per gallery and is how an item names its group in a
 * payload. That is not a convenience: the console creates a tab and the items
 * filed under it in the same submit, so at the moment an item has to reference
 * its group there is no id to reference.
 */
class GalleryGroup extends Model
{
    /** @var list<string> */
    protected $fillable = ['gallery_id', 'name', 'slug', 'sort_order'];

    protected function casts(): array
    {
        return ['sort_order' => 'integer'];
    }

    public function gallery(): BelongsTo
    {
        return $this->belongsTo(Gallery::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(GalleryItem::class);
    }
}
