<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * A group of services — "Web services", "Hardware services" — drawn as one
 * tab of the Services section (`docs/catalogue.md`).
 *
 * Taxonomy, like a product category: no publish status, no page and no SEO.
 * `is_active` takes a whole category off the public list without touching the
 * services in it, and `image_background` asks the site to draw the services'
 * pictures as the cards' ground.
 *
 * **Not `Sluggable`, deliberately.** That trait writes a 301 under
 * `urlPrefix()` whenever a slug changes, and a category has no address of its
 * own: any prefix it named would be somebody else's — under `/services` a
 * renamed category would redirect a *service's* URL. The slug here is a tab's
 * fragment id (`/services#hardware-services`), so it is derived on create and
 * kept unique, and nothing else.
 */
class ServiceCategory extends Model
{
    protected $fillable = ['name', 'slug', 'description', 'icon', 'sort_order', 'image_background', 'is_active'];

    /**
     * The columns' own defaults, held in memory too: a model created without
     * `is_active` would otherwise read null — false — until reloaded, and
     * the 201 would say a new category is switched off.
     */
    protected $attributes = [
        'sort_order' => 0,
        'image_background' => false,
        'is_active' => true,
    ];

    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
            'image_background' => 'boolean',
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

    /** @return HasMany<Service, $this> */
    public function services(): HasMany
    {
        return $this->hasMany(Service::class);
    }
}
