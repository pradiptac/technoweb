<?php

namespace App\Models;

use App\Enums\SlideCaptionPosition;
use App\Enums\SlideFit;
use App\Enums\SlideOverlay;
use App\Enums\SlideTextTone;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Slide extends Model
{
    protected $fillable = [
        'slider_id', 'kind', 'media_path', 'poster_path', 'youtube_id', 'alt_text',
        'heading', 'caption', 'link_url', 'link_label', 'caption_position', 'sort_order',
        'kicker', 'link2_url', 'link2_label', 'mobile_media_path', 'text_tone', 'overlay', 'duration_ms', 'fit',
    ];

    /** Mirrors the column default — see the note on Slider::$attributes. */
    protected $attributes = [
        'caption_position' => 'bottom-left', 'text_tone' => 'light', 'overlay' => 'standard', 'fit' => 'cover',
    ];

    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
            'caption_position' => SlideCaptionPosition::class,
            'text_tone' => SlideTextTone::class,
            'overlay' => SlideOverlay::class,
            'fit' => SlideFit::class,
            'duration_ms' => 'integer',
        ];
    }

    /** @return BelongsTo<Slider, $this> */
    public function slider(): BelongsTo
    {
        return $this->belongsTo(Slider::class);
    }

    public function isVideo(): bool
    {
        return in_array($this->kind, ['video', 'youtube'], true);
    }
}
