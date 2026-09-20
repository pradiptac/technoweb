<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A picture shown over a page, with a link on it.
 *
 * Its own table rather than a settings group, because the ask is "which popup
 * comes with which page" — that is many rows, each targeting a different set of
 * pages, and a settings group holds one of a thing. `sliders` and `galleries`
 * are the same shape and are tables for the same reason.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('popups', function (Blueprint $table) {
            $table->id();

            // The editor's own label. It never reaches a visitor — a popup is a
            // picture — so it exists purely to tell two of them apart in a list.
            $table->string('name');
            $table->string('status')->default('draft')->index();

            $table->string('image_path');
            /*
             * Nullable, because a popup announcing something needs no
             * destination. When it is set the whole picture becomes the link,
             * which is what anybody clicks anyway.
             */
            $table->string('link_url')->nullable();
            $table->boolean('link_new_tab')->default(false);

            /*
             * Which pages it appears on, in two halves.
             *
             * `sections` holds keys from `App\Support\SiteSection` — the
             * allowlist the menu builder already picks from, so the site's own
             * index pages are ticked rather than typed. `paths` is the escape
             * hatch for anything that list does not name: a pattern per line,
             * `/store/categories/*` or `*`.
             *
             * A **pattern**, deliberately, and not a relation to a record the
             * way `menu_items` stores one. A menu item names a single page and
             * would rot into a 404 in the site header the moment a slug moved;
             * a popup targets a *region* of the site, and `/store/*` survives
             * every rename underneath it. Where an exact path does go stale the
             * failure is also mild and self-correcting — the popup simply never
             * shows — rather than a dead link on every page.
             */
            $table->json('sections');
            $table->json('paths');

            /*
             * Three widths rather than a free number: predictable to design
             * artwork against, and one control on the form instead of a box
             * somebody can put 4000 in.
             */
            $table->string('size')->default('medium');

            /*
             * How often one visitor sees it. The default is once a session, and
             * that default is the whole difference between a promotion and the
             * pattern people install blockers for.
             */
            $table->string('frequency')->default('session');
            $table->unsignedInteger('delay_ms')->default(1500);

            /*
             * A promotion is time-boxed by nature, and the alternative is
             * somebody remembering to unpublish it. Both nullable: no window is
             * a popup that runs until it is switched off.
             */
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();

            /*
             * Which one wins when two match the same page — **one popup per
             * page load**, always. Two stacked over one page is not a feature
             * anybody asked for and is how a site becomes unusable.
             */
            $table->unsignedInteger('sort_order')->default(0);

            $table->timestamps();

            $table->index(['status', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('popups');
    }
};
