<?php

namespace App\Models;

use App\Enums\LocationLevel;
use App\Models\Concerns\RepathsLandingPages;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A place the company actually works in, and where it sits.
 *
 * Not seeded, and that is the point. A row here is a claim that engineers
 * attend sites in this place, and it is the claim every "<service> in <place>"
 * page rests on — so inventing them would be the doorway pattern and a false
 * statement about the business at the same time. The invented Mumbai address
 * already on the must-not-ship list is the same mistake made once.
 *
 * **A tree, not a list.** India → West Bengal → Kolkata → Salt Lake. The
 * hierarchy earns its keep in three places: a state page can roll up its cities
 * instead of repeating them, `areaServed` in the structured data is a real list
 * rather than a guess, and a breadcrumb can say where a neighbourhood is
 * without anybody typing it twice.
 *
 * **It does not shape the URL.** Pages live at `/locations/kolkata`, not
 * `/locations/west-bengal/kolkata`. Nesting them would make a two-segment place
 * path indistinguishable in shape from `/locations/kolkata/networking`, which
 * is the exact ambiguity `landing_pages.path` exists to avoid — and short URLs
 * are worth more here than a hierarchy nobody types.
 *
 * **`state` is derived, never stored.** A string beside a `parent_id` is a
 * second answer to one question, and the two disagree the first time a subtree
 * moves.
 *
 * `office_address`, `response_time` and `summary` are nullable columns and are
 * *not* optional to publish: `LandingPageQuality` requires at least one, and it
 * requires it **per place** — a state does not inherit substance from its
 * cities, or the template problem simply moves up a level.
 */
class Location extends Model
{
    use RepathsLandingPages;

    protected $fillable = [
        'parent_id', 'name', 'slug', 'level', 'country',
        'office_address', 'response_time', 'summary', 'sort_order', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'level' => LocationLevel::class,
        ];
    }

    public function getRouteKeyName(): string
    {
        return 'slug';
    }

    /**
     * Renaming a place moves every page about it, and every page about
     * something done there. See the trait: this model owns no redirect of
     * its own — `Sluggable` is not used here — so the landing page's own
     * `saving` hook is the only thing that writes one.
     */
    public static function landingPageKeyColumn(): string
    {
        return 'location_id';
    }

    /* ------------------------------------------------------------ the tree */

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')->orderBy('sort_order')->orderBy('name');
    }

    /**
     * Every ancestor, nearest first.
     *
     * Walked with `find()` rather than a recursive CTE. The tree is four levels
     * deep by construction — country, state, city, area — so this is at most
     * three queries, and a CTE would tie the whole model to MySQL 8 syntax for
     * a saving nobody could measure. The guard is there for a cycle that should
     * be impossible; `wouldCycle()` is what makes it impossible.
     *
     * @return array<int, self>
     */
    public function ancestors(): array
    {
        $out = [];
        $node = $this;

        for ($guard = 0; $guard < 10 && $node->parent_id; $guard++) {
            $node = self::find($node->parent_id);

            if (! $node) {
                break;
            }

            $out[] = $node;
        }

        return $out;
    }

    /**
     * This place and everything under it, for `areaServed` and for rollups.
     *
     * @return Collection<int, self>
     */
    public function selfAndDescendants(): Collection
    {
        $all = new Collection([$this]);
        $frontier = [$this->id];

        for ($guard = 0; $guard < 10 && $frontier !== []; $guard++) {
            $next = self::query()->whereIn('parent_id', $frontier)->get();

            if ($next->isEmpty()) {
                break;
            }

            $all = $all->merge($next);
            $frontier = $next->pluck('id')->all();
        }

        return $all;
    }

    /**
     * Would making `$parentId` the parent create a loop?
     *
     * The check that keeps the tree a tree. A cycle is not merely invalid — it
     * is invisible: every node in the loop still resolves, still renders, and
     * is simply unreachable from a root, so a whole branch disappears from the
     * navigation with nothing reporting an error. Same reasoning as the
     * product-category reparent guard.
     */
    public function wouldCycle(?int $parentId): bool
    {
        if ($parentId === null) {
            return false;
        }

        if ($this->exists && $parentId === $this->id) {
            return true;
        }

        $node = self::find($parentId);

        for ($guard = 0; $guard < 10 && $node; $guard++) {
            if ($this->exists && $node->id === $this->id) {
                return true;
            }

            $node = $node->parent_id ? self::find($node->parent_id) : null;
        }

        return false;
    }

    /* ----------------------------------------------------- what happens here */

    /**
     * Services offered here, as an editor stated rather than as code inferred.
     *
     * This relation is what turned `service_location` pages from a guess into a
     * fact. Before it, the generator proposed the first two published services
     * against every place — an arbitrary pairing that somebody then had to
     * write an introduction for, which is the shortest path to a template with
     * a noun substituted into it.
     */
    public function services(): BelongsToMany
    {
        return $this->belongsToMany(Service::class);
    }

    public function solutions(): BelongsToMany
    {
        return $this->belongsToMany(Solution::class);
    }

    public function landingPages(): HasMany
    {
        return $this->hasMany(LandingPage::class);
    }

    /* ------------------------------------------------------------- queries */

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeRoots(Builder $query): Builder
    {
        return $query->whereNull('parent_id');
    }

    /* ---------------------------------------------------------- derived */

    /**
     * The nearest ancestor that is a state, or null.
     *
     * **Named `stateAncestor`, not `state`.** A public method called `state()`
     * on an Eloquent model is a trap rather than a nicety: `$location->state`
     * — which is exactly what `only(['name','slug','state'])` does, and what
     * anybody would write — routes through `getAttribute`, finds the method and
     * throws "must return a relationship instance". It took down the public
     * landing-pages index, and the page's own graceful degradation hid it as an
     * empty list rather than an error.
     */
    public function stateAncestor(): ?self
    {
        foreach ($this->ancestors() as $ancestor) {
            if ($ancestor->level === LocationLevel::State) {
                return $ancestor;
            }
        }

        return null;
    }

    /** "Salt Lake, Kolkata, West Bengal" — how somebody would say where it is. */
    public function fullName(): string
    {
        $parts = array_merge(
            [$this->name],
            array_map(fn (self $a) => $a->name, array_filter(
                $this->ancestors(),
                fn (self $a) => $a->level !== LocationLevel::Country,
            )),
        );

        return implode(', ', $parts);
    }

    /**
     * Whether this place has anything of its own to say.
     *
     * Read by the gate rather than by the form: a location may be created with
     * nothing but a name — somebody has to start somewhere — and may not have a
     * published page until one of these is filled in.
     *
     * Deliberately **not** inherited from ancestors or children. A state page
     * that borrows Kolkata's response time is a state page saying nothing about
     * the state, which is the template problem moved up a level rather than
     * solved.
     */
    public function hasLocalSubstance(): bool
    {
        return filled($this->office_address) || filled($this->response_time) || filled($this->summary);
    }
}
