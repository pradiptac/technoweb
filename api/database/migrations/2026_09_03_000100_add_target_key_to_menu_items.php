<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Where a `section` menu item keeps which section it is.
 *
 * Its own column rather than reusing `url`, which is the obvious saving and
 * the wrong one: `url` means "a URL somebody typed" for a custom link, and a
 * column that means one thing for one type and something else for another is
 * the shape this project has already been bitten by — `stock` on a product
 * with variations, where the same column was dead for most rows and read
 * anyway. A section stores a **key**, `blog`, not a path, because the whole
 * point is that the path is resolved from one map at render time.
 *
 * Additive and nullable, so it applies to a live table without touching a row.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('menu_items', function (Blueprint $table) {
            $table->string('target_key', 60)->nullable()->after('target_id');
        });
    }

    public function down(): void
    {
        Schema::table('menu_items', function (Blueprint $table) {
            $table->dropColumn('target_key');
        });
    }
};
