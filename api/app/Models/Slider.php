<?php

namespace App\Models;

use App\Enums\PublishStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * A named carousel, addressed by slug from a shortcode: [slider slug="hero"].
 *
 * Deliberately does **not** use the Sluggable trait. That trait writes a 301
 * into the redirects table whenever a slug changes, which is exactly right for
 * the nine entities that have public URLs and exactly wrong here: a slider is
 * not a page, so the redirect would point /sliders/old at /sliders/new, two
 * URLs that have never existed, and the middleware would answer a real request
 * with a 301 into a 404.
 *
 * The slug is still a contract — renaming one breaks every body that embeds
 * it — but the breakage is a slider that stops rendering, not a broken link,
 * and the admin says so on the form.
 */
class Slider extends Model
{
    protected $fillable = ['name', 'slug', 'status', 'autoplay', 'interval_ms'];

    protected function casts(): array
    {
        return [
            'status' => PublishStatus::class,
            'autoplay' => 'boolean',
            'interval_ms' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $slider) {
            if (blank($slider->slug)) {
                $slider->slug = $slider->uniqueSlug($slider->name);
            }
        });
    }

    /** Appends -2, -3 … until the slug is free, ignoring this record's own row. */
    public function uniqueSlug(string $source): string
    {
        $base = Str::slug($source) ?: 'slider';
        $slug = $base;

        for ($n = 2; self::where('slug', $slug)->whereKeyNot($this->getKey())->exists(); $n++) {
            $slug = "{$base}-{$n}";
        }

        return $slug;
    }

    public function slides(): HasMany
    {
        return $this->hasMany(Slide::class)->orderBy('sort_order')->orderBy('id');
    }

    public function scopePublished(Builder $query): void
    {
        $query->where('status', PublishStatus::Published);
    }
}
