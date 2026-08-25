<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Slide extends Model
{
    protected $fillable = [
        'slider_id', 'kind', 'media_path', 'poster_path', 'youtube_id', 'alt_text',
        'heading', 'caption', 'link_url', 'link_label', 'sort_order',
    ];

    protected function casts(): array
    {
        return ['sort_order' => 'integer'];
    }

    public function slider(): BelongsTo
    {
        return $this->belongsTo(Slider::class);
    }

    public function isVideo(): bool
    {
        return in_array($this->kind, ['video', 'youtube'], true);
    }
}
