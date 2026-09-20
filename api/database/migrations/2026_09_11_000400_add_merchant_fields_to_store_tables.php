<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What a shopping feed needs and this catalogue could not say.
 *
 * The store shipped with `sku`, which is the merchant's own code and is not an
 * identifier anybody else recognises. Google matches a listing to the same part
 * sold elsewhere on a **GTIN** — the barcode the manufacturer assigned — or, for
 * a part that never had one, on **brand plus MPN**. Neither had a column, so
 * every item in this shop would have had to be declared as having no identifier
 * at all, which is both a demotion and a false statement about a resold Cisco
 * switch.
 *
 * `condition` is the third of that set. Merchant Center assumes `new` when it is
 * absent, which is a guess made on our behalf about the one attribute a buyer of
 * second-hand hardware most needs to be told.
 *
 * **`feed_include` is a separate decision from `status`**, the argument
 * `show_in_menu` already makes: being sold here and being advertised on Google
 * are different questions. It is also the only way to clear a disapproved item
 * without unpublishing it from our own shop, which would be taking a product off
 * sale to satisfy an advertising platform.
 *
 * **There is deliberately no `identifier_exists` column.** It is `false` exactly
 * when the GTIN and the MPN are both blank, so storing it would be a second
 * answer to a question these two columns already settle — and the two would
 * disagree the first time somebody filled a barcode in without unticking it.
 *
 * `weight_grams` already existed on a variation and not on a product, which is
 * the same asymmetry `stock` has and the wrong one here: a product with no
 * variations still has to be put in a box.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('store_products', function (Blueprint $table) {
            // Nullable, both of them. A GTIN cannot be invented and an MPN
            // cannot be derived from anything on this row.
            $table->string('gtin', 50)->nullable()->after('sku');
            $table->string('mpn', 70)->nullable()->after('gtin');

            /*
             * A varchar rather than a native ENUM, the rule every lifecycle in
             * this codebase follows: MySQL's ENUM cannot be extended without an
             * ALTER, and the branch lives in PHP.
             *
             * Defaults to `new`, which is what Merchant Center assumes anyway —
             * so the default changes nothing about how the catalogue is read and
             * only makes the assumption visible in the console.
             */
            $table->string('condition', 16)->default('new')->after('mpn');

            // Google's own taxonomy, as the numeric id or the full path. Null
            // falls back to the category's, and then to Google's own inference.
            $table->string('google_product_category')->nullable()->after('condition');

            $table->unsignedInteger('weight_grams')->nullable()->after('stock');

            $table->boolean('feed_include')->default(true)->after('is_featured');
        });

        Schema::table('store_product_variations', function (Blueprint $table) {
            // Per variation, because that is what is actually bought and what a
            // feed lists: the 24-port and the 48-port are two barcodes.
            $table->string('gtin', 50)->nullable()->after('sku');
            $table->string('mpn', 70)->nullable()->after('gtin');
        });

        Schema::table('store_categories', function (Blueprint $table) {
            $table->string('google_product_category')->nullable()->after('description');
        });
    }

    public function down(): void
    {
        Schema::table('store_products', function (Blueprint $table) {
            $table->dropColumn([
                'gtin', 'mpn', 'condition', 'google_product_category',
                'weight_grams', 'feed_include',
            ]);
        });

        Schema::table('store_product_variations', function (Blueprint $table) {
            $table->dropColumn(['gtin', 'mpn']);
        });

        Schema::table('store_categories', function (Blueprint $table) {
            $table->dropColumn('google_product_category');
        });
    }
};
