<?php

namespace App\Models;

use App\Enums\PublishStatus;
use App\Enums\SlideCaptionAnimation;
use App\Enums\SliderLayout;
use App\Enums\SliderTransition;
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
    /**
     * Sliders the site reads by slug, and what each one draws.
     *
     * The homepage and the shop front each ask for a carousel by name
     * (`lib/home-data.ts`, `store/page.tsx`), which made those two records
     * deletable out from under the page that needs them in one press -- and
     * on 2026-09-17 the homepage hero *was* deleted that way, from the
     * console, taking its five slides with it. Nothing stored the slides
     * afterwards; they came back out of MySQL's binary log.
     *
     * A reserved slider is still deletable -- the client asked for that
     * rather than a lock -- but only on a request that says `confirm`, which
     * the console sends from a second step that names what the page will
     * fall back to. One press cannot do it, and neither can a script that
     * did not read this.
     *
     * A map rather than a list so the refusal can say what the slider is
     * for, and on the model rather than in the controller because the
     * resource reads it too.
     */
    public const RESERVED = [
        'homepage-hero' => 'the homepage hero',
        'store-hero' => 'the shop front',
    ];

    protected $fillable = ['name', 'slug', 'status', 'layout', 'transition', 'caption_animation', 'autoplay', 'interval_ms'];

    /**
     * Mirrors the column defaults, because a database default only applies on
     * the way *back* — a record created in one request and serialised in the
     * same breath has never been read, so the attribute is null and the enum
     * cast returns null with it. That is a response saying this slider has no
     * layout when the row plainly does. The same defect `StoreProduct` and
     * `StoreProductVariation` declare `$attributes` for, found the same way:
     * by a test that created a record and asked about it without a round trip.
     */
    protected $attributes = ['layout' => 'full', 'caption_animation' => 'none'];

    protected function casts(): array
    {
        return [
            'status' => PublishStatus::class,
            'layout' => SliderLayout::class,
            'transition' => SliderTransition::class,
            'caption_animation' => SlideCaptionAnimation::class,
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

    public function isReserved(): bool
    {
        return array_key_exists($this->slug, self::RESERVED);
    }

    /** "the homepage hero", or null for a slider nothing reserves. */
    public function reservedFor(): ?string
    {
        return self::RESERVED[$this->slug] ?? null;
    }

    /** @return HasMany<Slide, $this> */
    public function slides(): HasMany
    {
        return $this->hasMany(Slide::class)->orderBy('sort_order')->orderBy('id');
    }

    public function scopePublished(Builder $query): void
    {
        $query->where('status', PublishStatus::Published);
    }
}
