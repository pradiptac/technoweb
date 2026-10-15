<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Delivery charges (0.142.0, docs/store.md "Delivery charges and shipping
 * zones").
 *
 * Until now `store_shipping_paise` was shown on pages and declared in the
 * Google feed and added to nothing: `orders` had no shipping column and the
 * basket never read the setting. This migration is the other half — a place
 * on the order to snapshot what was charged, and the zones and weight slabs a
 * charge can be quoted from.
 *
 * `states` is a list of two-letter codes (`App\Support\IndianStates`), kept as
 * JSON because a zone is read whole and a state is looked up by scanning the
 * handful of zones, never queried across the table. "A state belongs to at
 * most one active zone" is therefore the endpoint's rule, checked in a
 * transaction, not an index.
 *
 * The order's three columns are a snapshot and nothing downstream re-quotes
 * from them: the charge, the zone's *name* as it was then, and the weight the
 * charge was worked out from.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shipping_zones', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->json('states')->nullable();
            // A zone can be a place the shop does not deliver to. It then
            // carries no slabs, and a basket bound there is refused.
            $table->boolean('delivers')->default(true);
            $table->unsignedBigInteger('free_above_paise')->nullable();
            $table->unsignedBigInteger('extra_per_kg_paise')->nullable();
            // "Rest of India": every state no other active zone claims.
            $table->boolean('is_default')->default(false);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('shipping_rates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shipping_zone_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('up_to_grams');
            $table->unsignedBigInteger('charge_paise');
            $table->timestamps();

            $table->unique(['shipping_zone_id', 'up_to_grams']);
        });

        Schema::table('carts', function (Blueprint $table) {
            // The state a basket was last quoted for, as a code. Saved by
            // `PATCH /cart/destination` while the checkout is being filled in.
            $table->string('ship_state', 2)->nullable();
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->unsignedBigInteger('shipping_paise')->default(0)->after('discount_paise');
            $table->string('shipping_zone', 120)->nullable()->after('shipping_paise');
            $table->unsignedInteger('shipping_weight_grams')->nullable()->after('shipping_zone');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['shipping_paise', 'shipping_zone', 'shipping_weight_grams']);
        });

        Schema::table('carts', function (Blueprint $table) {
            $table->dropColumn('ship_state');
        });

        Schema::dropIfExists('shipping_rates');
        Schema::dropIfExists('shipping_zones');
    }
};
