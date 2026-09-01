<?php

namespace App\Models;

use App\Enums\GalleryTransition;
use App\Enums\PublishStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * A named set of pictures, addressed by slug from a shortcode:
 * [gallery slug="recent-work"].
 *
 * Deliberately does **not** use the Sluggable trait, for the reason `Slider`
 * documents: that trait writes a 301 from `urlPrefix()/old` on every slug
 * change, and a gallery has no URL — so the redirect would point
 * `/galleries/old` at `/galleries/new`, two paths that have never existed, and
 * the proxy would answer a real request with a redirect into a 404.
 *
 * The slug is still a contract. Renaming one breaks every body that embeds it,
 * but the breakage is a gallery that stops rendering rather than a broken
 * link, and the admin form says so beside the field.
 */
class Gallery extends Model
{
    /** @var list<string> */
    protected $fillable = ['name', 'slug', 'subtitle', 'status', 'autoplay', 'interval_ms', 'transition'];

    protected function casts(): array
    {
        return [
            'status' => PublishStatus::class,
            'transition' => GalleryTransition::class,
            'autoplay' => 'boolean',
            'interval_ms' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $gallery) {
            if (blank($gallery->slug)) {
                $gallery->slug = $gallery->uniqueSlug($gallery->name);
            }
        });
    }

    /** Appends -2, -3 … until the slug is free, ignoring this record's own row. */
    public function uniqueSlug(string $source): string
    {
        $base = Str::slug($source) ?: 'gallery';
        $slug = $base;

        for ($n = 2; self::where('slug', $slug)->whereKeyNot($this->getKey())->exists(); $n++) {
            $slug = "{$base}-{$n}";
        }

        return $slug;
    }

    public function groups(): HasMany
    {
        return $this->hasMany(GalleryGroup::class)->orderBy('sort_order')->orderBy('id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(GalleryItem::class)->orderBy('sort_order')->orderBy('id');
    }

    public function scopePublished(Builder $query): void
    {
        $query->where('status', PublishStatus::Published);
    }
}
