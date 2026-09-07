<?php

namespace App\Models;

use App\Enums\SlideCaptionPosition;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Slide extends Model
{
    protected $fillable = [
        'slider_id', 'kind', 'media_path', 'poster_path', 'youtube_id', 'alt_text',
        'heading', 'caption', 'link_url', 'link_label', 'caption_position', 'sort_order',
    ];

    /** Mirrors the column default — see the note on Slider::$attributes. */
    protected $attributes = ['caption_position' => 'bottom-left'];

    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
            'caption_position' => SlideCaptionPosition::class,
        ];
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
