<?php

namespace App\Models;

use App\Models\Concerns\Sluggable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * A blog category.
 *
 * `Sluggable`, so renaming one writes its own 301 from `/blog/category/old` —
 * these are linked from every card that carries the badge and from the
 * sidebar, so a rename with no redirect would break a set of URLs an editor
 * cannot see from the screen they renamed it on. That is the failure
 * `RepathsLandingPages` exists for, avoided here by the trait.
 *
 * No `HasSeo` and no status. A category is a **facet** — a filtered listing of
 * posts — the same call `Brand` makes for the product catalogue, and drafting
 * one is not a thing anybody wants to do: an empty category simply does not
 * appear, because the sidebar and the strip are built from counts.
 */
class BlogCategory extends Model
{
    use Sluggable;

    protected $fillable = ['name', 'slug', 'description', 'sort_order'];

    protected $attributes = ['sort_order' => 0];

    protected function casts(): array
    {
        return ['sort_order' => 'integer'];
    }

    protected function slugSource(): string
    {
        return 'name';
    }

    public function urlPrefix(): string
    {
        return '/blog/category';
    }

    public function posts(): BelongsToMany
    {
        return $this->belongsToMany(BlogPost::class);
    }

    /**
     * How many *published* posts are filed here.
     *
     * Counting everything would put drafts in a number a visitor reads, so the
     * sidebar would promise eight articles and list five. The count and the
     * listing behind it are the same query, which is the rule the store's
     * "out of stock" tile already follows: a tile reading three that opens a
     * list of five is worse than no tile.
     */
    public function publishedPosts(): BelongsToMany
    {
        return $this->posts()->published();
    }
}
