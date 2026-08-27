<?php

namespace App\Models\Concerns;

use App\Models\LandingPage;
use Illuminate\Support\Facades\DB;

/**
 * Keep composed landing-page URLs in step with the records they are built from.
 *
 * A landing page's `path` is assembled from two or three *other* records'
 * slugs — `/brands/cisco/switches` is a Brand and a ProductCategory, and the
 * landing page owns neither. `LandingPage`'s own `saving` hook recomputes the
 * path and writes the 301, which is correct and was never enough: nothing
 * saved the page when a **constituent** was renamed. Fixing a typo in a brand
 * name on a different screen therefore moved every page under that brand and
 * wrote no redirect at all — a live, ranking URL turned into a 404 silently,
 * which is precisely the outcome the whole module exists to prevent.
 *
 * It survived review because the test that covers it calls `$page->touch()`
 * after the rename. That proves the model event fires; it proves nothing about
 * anything invoking it. The tests added alongside this trait rename each
 * constituent and then touch nothing.
 *
 * **`updated`, not `saved`.** A rename that fails to commit must not write a
 * redirect for a path that never existed. **`wasChanged`, not `isDirty`** —
 * by the time `updated` fires the attributes are no longer dirty, and
 * `isDirty('slug')` there is a condition that is always false.
 */
trait RepathsLandingPages
{
    public static function bootRepathsLandingPages(): void
    {
        static::updated(function ($model) {
            if ($model->wasChanged('slug')) {
                $model->repathLandingPages();
            }
        });
    }

    /**
     * Which column on `landing_pages` points back at this model.
     *
     * Declared abstract rather than guessed from the class name: the category
     * relation is `product_category_id` while the model is `ProductCategory`,
     * and a convention with one exception is a convention that fails silently
     * on exactly the case nobody tests.
     */
    abstract public static function landingPageKeyColumn(): string;

    /**
     * Re-save every page addressed by this record, in one transaction.
     *
     * `save()` rather than a mass update, and deliberately so: the path and
     * the redirect are both written by `LandingPage`'s `saving` hook, and a
     * mass `update()` skips model events entirely. Fast and wrong here is a
     * set of moved URLs with no redirects behind them — the original bug,
     * reintroduced in the name of one fewer query.
     *
     * The hook makes the row dirty itself, so a page whose path has not
     * actually moved writes nothing.
     */
    public function repathLandingPages(): void
    {
        DB::transaction(function () {
            LandingPage::query()
                ->where(static::landingPageKeyColumn(), $this->getKey())
                ->get()
                ->each
                ->save();
        });
    }
}
