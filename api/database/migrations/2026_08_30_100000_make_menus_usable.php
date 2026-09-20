<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The menus tables have existed since Phase 1 and have never been used.
 *
 * They were provisioned with the original schema — a `menus` row and
 * `menu_items` holding a label, a `url` and a parent — and nothing was ever
 * built on them: no model, no controller, no route. Meanwhile the header's
 * links and the footer's columns stayed hard-coded in
 * `web/src/content/site.ts`, so "put Careers in the main menu" was a deploy on
 * a site whose whole point is that the client edits it.
 *
 * This makes them usable rather than adding a second pair beside them. The one
 * change of substance is that an item stops storing a URL and starts storing a
 * **record reference**: `url` becomes nullable and is now only for a custom
 * link, while everything else points at a row and resolves to that row's
 * current address when it is rendered. A stored URL rots the first time
 * somebody fixes a typo in a slug — and a menu is on every page of the site,
 * so that is a sitewide 404 caused by an edit made on a different screen.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('menus', function (Blueprint $table) {
            /*
             * Nullable, so a menu can exist before it is assigned anywhere —
             * one being built, or kept aside for a seasonal swap. The unique
             * index stays: two menus claiming the header is a question with no
             * answer, and MySQL's unique ignores nulls, so any number may sit
             * unassigned.
             */
            $table->string('location', 40)->nullable()->change();
        });

        Schema::table('menu_items', function (Blueprint $table) {
            // Which kind of thing this points at — a morph map alias, or
            // 'custom'. See App\Enums\MenuItemType.
            $table->string('type', 40)->default('custom')->after('label');
            $table->nullableMorphs('target');

            // Only a custom link has an address of its own now.
            $table->string('url')->nullable()->change();

            // Rendered beside the label in the mega panel — the same iconMap
            // key every catalogue record already stores.
            $table->string('icon', 60)->nullable()->after('url');
            $table->string('description', 160)->nullable()->after('icon');

            // Hiding an item without deleting it, keeping its place in the
            // order: a seasonal link, or one whose destination is not ready.
            $table->boolean('is_active')->default(true)->after('open_in_new_tab');
        });
    }

    public function down(): void
    {
        Schema::table('menu_items', function (Blueprint $table) {
            $table->dropMorphs('target');
            $table->dropColumn(['type', 'icon', 'description', 'is_active']);
        });
    }
};
