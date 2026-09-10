<?php

namespace App\Models;

use App\Enums\PopupFrequency;
use App\Enums\PopupSize;
use App\Enums\PublishStatus;
use App\Support\SiteSection;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * A picture shown over a page, with a link on it.
 *
 * Deliberately has **no slug and no `Sluggable`**. A popup is not a page and is
 * never addressed by URL — the site asks for every live one and decides which
 * to show from the path it is already on — so a slug would be an identifier
 * nothing looks up, and `Sluggable` would write a 301 from `/popups/old` to
 * `/popups/new`, two URLs that have never existed. `Slider` records the same
 * reasoning for the same reason.
 */
class Popup extends Model
{
    protected $fillable = [
        'name', 'status', 'image_path', 'link_url', 'link_new_tab',
        'sections', 'paths', 'size', 'frequency', 'delay_ms',
        'starts_at', 'ends_at', 'sort_order',
    ];

    /**
     * Mirrors the column defaults, because a database default only applies on
     * the way *back*: a record created in one request and serialised in the
     * same breath has never been read, so the attribute is null and the enum
     * cast returns null with it — a response saying this popup has no size when
     * the row plainly does. `Slider`, `StoreProduct` and
     * `StoreProductVariation` all declare `$attributes` for this, and every one
     * of them found it the same way, from a test that created a record and
     * asked about it without a round trip.
     */
    protected $attributes = [
        'status' => 'draft',
        'size' => 'medium',
        'frequency' => 'session',
        'delay_ms' => 1500,
        'link_new_tab' => false,
        'sort_order' => 0,

        /*
         * These two are here for a second, harder reason: **MySQL will not
         * take a default on a JSON column at all**, so the migration cannot
         * give them one and a create that omits either dies on
         * `Field 'paths' doesn't have a default value`. Raw values, because
         * `$attributes` is pre-cast — the `array` cast reads `'[]'` back as
         * `[]` and writes it out unchanged.
         *
         * Found by a test creating a popup with only the fields somebody would
         * actually fill in, which is the case the console hits first.
         */
        'sections' => '[]',
        'paths' => '[]',
    ];

    protected function casts(): array
    {
        return [
            'status' => PublishStatus::class,
            'size' => PopupSize::class,
            'frequency' => PopupFrequency::class,
            'sections' => 'array',
            'paths' => 'array',
            'link_new_tab' => 'boolean',
            'delay_ms' => 'integer',
            'sort_order' => 'integer',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
        ];
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', PublishStatus::Published);
    }

    /**
     * Published *and* inside its own window.
     *
     * Separate from `published()` because they answer different questions and
     * the console needs the first without the second: an editor looking at a
     * list of popups must see one whose promotion ended last week, or they
     * cannot tell it from one that was never published. Only the public
     * endpoint asks for `live()`.
     *
     * Both bounds are nullable and each is checked independently — a popup with
     * an end and no start is one that runs until a date, which is the ordinary
     * shape of a promotion somebody set up in a hurry.
     */
    public function scopeLive(Builder $query): Builder
    {
        return $query->published()
            ->where(fn (Builder $q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', now()))
            ->where(fn (Builder $q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', now()));
    }

    /**
     * Every path pattern this popup should appear on.
     *
     * **The sections are expanded here**, which is what keeps `SiteSection` out
     * of the browser: the frontend receives patterns and matches strings, and
     * never learns that a section key exists. A key that has since left the
     * allowlist resolves to null and is dropped, exactly as a menu item whose
     * record was deleted is dropped rather than rendered dead.
     *
     * A section becomes a **subtree** pattern — ticking "Store" means the shop,
     * including `/store/products/…` — because that is what anybody means by it.
     * `home` is the exception and stays exact: `/` as a subtree is the whole
     * site, so ticking Home would silently mean everywhere.
     *
     * @return array<int, string>
     */
    public function matchPatterns(): array
    {
        $patterns = [];

        foreach ($this->sections ?? [] as $key) {
            $path = SiteSection::path((string) $key);

            if ($path === null) {
                continue;
            }

            $patterns[] = $path === '/' ? '/' : rtrim($path, '/').'/*';
        }

        foreach ($this->paths ?? [] as $pattern) {
            $pattern = trim((string) $pattern);

            if ($pattern !== '') {
                $patterns[] = $pattern;
            }
        }

        return array_values(array_unique($patterns));
    }
}
