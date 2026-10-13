<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * What kind of work a tender is for — "Networking", "Hardware supply",
 * "Annual maintenance" (docs/tenders.md).
 *
 * Taxonomy, the `DownloadCategory` shape: no publish status, no page and no
 * SEO. `is_active` takes a whole category off the public list without
 * touching the tenders in it. Not `Sluggable`, for that class's reason: the
 * slug is a filter value on `/tenders?category=`, not an address of its own,
 * so there is nothing a 301 could be written for — and a 301 under
 * `urlPrefix()` would move a *tender's* URL.
 */
class TenderCategory extends Model
{
    protected $fillable = ['name', 'slug', 'description', 'sort_order', 'is_active'];

    // The columns' own defaults, held in memory too — see `DownloadCategory`.
    protected $attributes = [
        'sort_order' => 0,
        'is_active' => true,
    ];

    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $category) {
            if (blank($category->slug)) {
                $category->slug = $category->uniqueSlug((string) $category->name);
            }
        });
    }

    /** `name` slugged, suffixed -2, -3… until no other category holds it. */
    public function uniqueSlug(string $source): string
    {
        $slug = Str::slug($source) ?: 'category';
        $candidate = $slug;
        $i = 2;

        while (
            static::query()
                ->where('slug', $candidate)
                ->when($this->exists, fn ($q) => $q->whereKeyNot($this->getKey()))
                ->exists()
        ) {
            $candidate = $slug.'-'.$i++;
        }

        return $candidate;
    }

    /** @param Builder<self> $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('is_active', true);
    }

    /** @param Builder<self> $query */
    public function scopeOrdered(Builder $query): void
    {
        $query->orderBy('sort_order')->orderBy('name')->orderBy('id');
    }

    /** @return HasMany<Tender, $this> */
    public function tenders(): HasMany
    {
        return $this->hasMany(Tender::class);
    }
}
