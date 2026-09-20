<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Indexes for columns every public read filters or sorts on and nothing
 * indexed.
 *
 * `media.path` is the one that matters most: it is how every stored image
 * path finds its library row — `MediaAlt`, the popup dimensions, the public
 * `/settings` logo and banner sizes — and a lookup by an unindexed string
 * column is a scan of the whole library on every one of those. The path is
 * a hashed filename under a dated directory, so it is unique in practice;
 * indexed rather than made unique because `copy` writes the same bytes
 * under a new hash and nothing here needs the constraint.
 *
 * `pages.status` and `case_studies.status` are read by every public listing
 * of those tables (`published()` scopes) and were the two content tables
 * without an index on it — blog posts and knowledge articles have carried a
 * composite one since the schema was written. `products` gets the default
 * listing order: `status` narrows, then `is_featured DESC, sort_order` is
 * the `?sort=featured` ordering the catalogue opens on.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('media', function (Blueprint $table) {
            $table->index('path');
        });

        Schema::table('pages', function (Blueprint $table) {
            $table->index('status');
        });

        Schema::table('case_studies', function (Blueprint $table) {
            $table->index('status');
        });

        Schema::table('products', function (Blueprint $table) {
            $table->index(['status', 'is_featured', 'sort_order'], 'products_featured_listing_index');
        });
    }

    public function down(): void
    {
        Schema::table('media', function (Blueprint $table) {
            $table->dropIndex(['path']);
        });

        Schema::table('pages', function (Blueprint $table) {
            $table->dropIndex(['status']);
        });

        Schema::table('case_studies', function (Blueprint $table) {
            $table->dropIndex(['status']);
        });

        Schema::table('products', function (Blueprint $table) {
            $table->dropIndex('products_featured_listing_index');
        });
    }
};
