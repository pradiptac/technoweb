<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A category's own icon file, beside the `icon` key and the photograph.
 *
 * Two pictures on one row, answering different questions. `image_path` is a
 * *photograph* and is what the category's `og:image` is built from — a picture
 * nobody sees at 64px and everybody sees when the page is shared. `icon_path`
 * is the small mark the category rail and the sidebar render, which has to read
 * at 64px and has to belong to a set.
 *
 * There is deliberately no `icon` key beside them. Store categories are marked
 * with real 3D icons rather than the built-in line set, and offering both would
 * mean a rail drawn in two different languages depending on which control an
 * editor happened to use.
 *
 * Nullable, so a category nobody has given a file to still renders — the rail
 * draws an empty tile rather than substituting a glyph.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('store_categories', function (Blueprint $table) {
            $table->string('icon_path')->nullable()->after('description');
        });
    }

    public function down(): void
    {
        Schema::table('store_categories', function (Blueprint $table) {
            $table->dropColumn('icon_path');
        });
    }
};
