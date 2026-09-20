<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The store's own catalogue, kept separate from the site's.
 *
 * The first cut of this put `is_sellable` and a price on `products`, on the
 * grounds that one product entry serving both jobs is one record to maintain.
 * That was the wrong call for this business and the instruction is explicit:
 * **what the store sells is maintained separately from what the site
 * advertises.** They are different lists with different lifecycles — the
 * catalogue exists to be found by somebody researching a project, and most of
 * it is quoted per site and never sold from a page.
 *
 * What that buys, beyond doing as asked: the marketing catalogue keeps its
 * shape. No price column that is null on 200 of 210 rows, no Buy button one
 * mistaken tick away from appearing on a switch that is not for sale, and no
 * SEO consequence on URLs that already rank.
 *
 * What it costs: a manufacturer's product sold in the store and listed in the
 * catalogue is two rows. That is real, and it is the trade that was chosen.
 *
 * **`brands` is reused rather than duplicated**, because a brand is a fact
 * about a manufacturer rather than an editorial decision — Cisco is Cisco on
 * both lists, and two brand tables means two logos to upload and two spellings
 * to drift. Categories are *not* reused, for the opposite reason: how a
 * listing is arranged is exactly the thing being maintained separately.
 *
 * **Money is stored in paise as an integer.** See `App\Support\Money`: a price
 * is an exact count of the smallest unit there is, a float cannot hold 118.10,
 * and a `decimal` column comes back from PDO as a string that the first
 * arithmetic anybody writes converts to a float anyway.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('store_categories', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->text('description')->nullable();
            $table->string('image_path')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('store_products', function (Blueprint $table) {
            $table->id();

            $table->foreignId('store_category_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('brand_id')->nullable()->constrained()->nullOnDelete();

            $table->string('name');
            $table->string('slug')->unique();
            $table->string('sku')->nullable();

            /*
             * Physical, digital or service — the three fulfilment paths, and
             * the only reason this column exists. A varchar rather than a
             * native ENUM, the rule every lifecycle here follows: MySQL's ENUM
             * cannot be extended without an ALTER, and the branch lives in PHP.
             */
            $table->string('type', 16)->default('physical');

            $table->string('short_description', 500)->nullable();
            $table->longText('description')->nullable();
            $table->json('images')->nullable();
            $table->json('specifications')->nullable();
            $table->json('features')->nullable();

            // GST-inclusive, always. The displayed price is the price paid.
            $table->unsignedBigInteger('price_paise');
            // The struck-through "was". Nullable, and never invented.
            $table->unsignedBigInteger('compare_at_paise')->nullable();

            /*
             * Stock tracking is opt-out.
             *
             * Defaulting the other way means the first product listed oversells
             * silently, which is the failure nobody notices until somebody has
             * paid for a thing that is not there. A service is the honest
             * exception and turns it off.
             */
            $table->boolean('track_stock')->default(true);
            $table->integer('stock')->default(0);

            /*
             * Returnable, defaulting to true.
             *
             * The false case is a claim made to a customer *before they pay*,
             * so it has to be something somebody ticked deliberately. A default
             * of false would put "this product is non-returnable" on every
             * page in the store on the day it opens.
             */
            $table->boolean('returnable')->default(true);

            $table->string('status', 20)->default('draft');
            $table->boolean('is_featured')->default(false);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            // The store's whole index query.
            $table->index(['status', 'sort_order']);
        });

        /*
         * A variation is a thing you can buy, not a point in a grid.
         *
         * The brief shows two dimensions — RAM and Storage — and warns in the
         * same breath against unnecessary complexity. Those pull apart if
         * variations are a *matrix*: dimensions, values, and a generated
         * cartesian product where most cells are combinations nobody stocks.
         *
         * So a product has a flat list of variants and each carries its own
         * ordered set of options: `[["RAM", "16 GB"], ["Storage", "1 TB"]]`.
         * One dimension or three costs the same, the storefront builds a
         * selector per option name from what exists, and an unstocked
         * combination is a row nobody created rather than a cell to disable.
         *
         * The options go through `App\Casts\SpecSheet` for the reason that cast
         * exists: **MySQL does not preserve JSON object key order**, so "RAM"
         * and "Storage" come back sorted and the selectors on the product page
         * reorder themselves between two loads.
         */
        Schema::create('store_product_variations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_product_id')->constrained()->cascadeOnDelete();

            // What the buyer picks: "16 GB / 1 TB".
            $table->string('name');
            $table->string('sku')->nullable();
            $table->json('options')->nullable();

            // Null means the product's price. A variation that costs the same
            // must not be a second copy of a number to change twice.
            $table->unsignedBigInteger('price_paise')->nullable();
            $table->integer('stock')->default(0);
            $table->unsignedInteger('weight_grams')->nullable();
            $table->string('image_path')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['store_product_id', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('store_product_variations');
        Schema::dropIfExists('store_products');
        Schema::dropIfExists('store_categories');
    }
};
