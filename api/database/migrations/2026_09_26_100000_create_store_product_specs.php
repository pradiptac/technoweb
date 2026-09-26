<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Specification filters and product video (2026-09-26,
 * `docs/store-merch-plan.md`).
 *
 * **`store_product_specs` is derived, never edited.** A spec sheet is stored
 * on the product as ordered pairs (`App\Casts\SpecSheet`) and a variation's
 * options the same way — JSON, which cannot be indexed for "every product
 * whose Ports is 24 or 48". So each product's sheet and its active
 * variations' options are copied into rows here, rebuilt whenever either is
 * saved (`App\Support\Store\SpecIndex`), and filtered and counted on the
 * normalised keys: trimmed, whitespace collapsed, lower-cased, so "24 ports"
 * and "24  Ports" are one value. `label` and `value` keep the words as an
 * editor typed them, for display.
 *
 * One row per product, label and value — a spec sheet and a variation
 * saying the same thing are one fact, and the unique index is what says so.
 *
 * `store_categories.filter_specs` is the ordered list of labels a category
 * offers as filters, chosen from what its products actually carry.
 * `store_products.videos` is a list of up to four: a YouTube id or a media
 * library file, a title and a poster.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('store_product_specs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_product_id')->constrained('store_products')->cascadeOnDelete();
            $table->string('label');
            $table->string('value');
            $table->string('label_key', 191);
            $table->string('value_key', 191);

            $table->unique(['store_product_id', 'label_key', 'value_key'], 'store_product_specs_row_unique');
            $table->index(['label_key', 'value_key'], 'store_product_specs_key_index');
        });

        Schema::table('store_categories', function (Blueprint $table) {
            $table->json('filter_specs')->nullable()->after('google_product_category');
        });

        Schema::table('store_products', function (Blueprint $table) {
            $table->json('videos')->nullable()->after('images');
        });
    }

    public function down(): void
    {
        Schema::table('store_products', function (Blueprint $table) {
            $table->dropColumn('videos');
        });

        Schema::table('store_categories', function (Blueprint $table) {
            $table->dropColumn('filter_specs');
        });

        Schema::dropIfExists('store_product_specs');
    }
};
