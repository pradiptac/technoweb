<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which records the mega menu is allowed to show.
 *
 * The menu maps *every* solution, product category, service and industry, so
 * it grew without limit — nine solutions fit, forty would not, and there was
 * no way to say "this one is real but keep it out of the navigation". A
 * catalogue and a navigation are different things, and the flag is what
 * separates them.
 *
 * **Defaults to true, deliberately.** Defaulting to false would empty the
 * navigation on the deploy that runs this, which is a far worse first
 * impression than a menu that is briefly too long. Editors untick from a full
 * menu rather than rebuilding one from nothing.
 */
return new class extends Migration
{
    /** The four tables the mega menu reads. Products are reached through their category. */
    private const TABLES = ['solutions', 'product_categories', 'services', 'industries'];

    public function up(): void
    {
        foreach (self::TABLES as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->boolean('show_in_menu')->default(true)->after('sort_order');

                // The menu asks for exactly these rows on every cold render, so
                // it is worth an index even at these row counts.
                $t->index('show_in_menu');
            });
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->dropIndex(['show_in_menu']);
                $t->dropColumn('show_in_menu');
            });
        }
    }
};
