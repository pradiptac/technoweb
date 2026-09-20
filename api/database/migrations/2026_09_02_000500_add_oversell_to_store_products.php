<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * May this be sold when there is none left?
 *
 * Until now the answer was always no: the checkout refuses the whole order when
 * a line is short, under the row lock that makes the check mean anything. That
 * is the right default and it is not always right — a switch that is three days
 * out from the distributor is a sale worth taking, and refusing it is a sale
 * lost to somebody who will take it.
 *
 * **On the variation as well as the product, because that is where the stock
 * is.** A product with variations counts per variation — `inStock()` answers
 * from the set, which is why a 48-port switch is not called unavailable when
 * the 24-port runs out — so a flag that lived only on the parent could not say
 * "the 24-port is back-ordered and the 48-port is not", which is the case
 * somebody actually has. The variation answers for itself and the product's own
 * flag applies when there are no variations: exactly how `stock` already works,
 * and a second arrangement for one column would be a second rule to remember.
 *
 * **Default false, on both.** Overselling is a promise to a customer that the
 * shop then has to keep, and a default that makes promises is the wrong one.
 * It is also what the store did yesterday, so the migration changes no
 * behaviour on the day it runs.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('store_products', function (Blueprint $table) {
            $table->boolean('allow_oversell')->default(false)->after('stock');
        });

        Schema::table('store_product_variations', function (Blueprint $table) {
            $table->boolean('allow_oversell')->default(false)->after('stock');
        });
    }

    public function down(): void
    {
        Schema::table('store_products', function (Blueprint $table) {
            $table->dropColumn('allow_oversell');
        });

        Schema::table('store_product_variations', function (Blueprint $table) {
            $table->dropColumn('allow_oversell');
        });
    }
};
