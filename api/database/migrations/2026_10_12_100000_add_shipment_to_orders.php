<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Courier booking and tracking (0.143.0, docs/store.md "Shiprocket").
 *
 * Where an order's parcel has got to with the courier platform. Every column
 * is null for an order nothing has been asked of — every order before this,
 * and every order while the courier setting is `manual` — so the tracker's
 * query and the console's panel have nothing to say about them.
 *
 * `shipment_booking` is the claim, the `zoho_status` pattern: one conditional
 * UPDATE decides which caller creates the platform's order, because a
 * duplicate `order_id` is not a documented safe retry. `shipment_order_id`
 * and `shipment_id` are the platform's own two ids — different endpoints want
 * different ones. The courier, the AWB and the tracking link go in the
 * `courier`, `tracking_number` and `tracking_url` columns a hand-typed
 * tracking number has always used, so every email and both order pages read
 * a booked parcel without knowing where it came from.
 *
 * `shipment_status_id` is the platform's shipment-level status code (never
 * its order-level one); the monotonic rule that stops a late scan moving an
 * order backwards reads it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->string('shipment_provider', 20)->nullable()->after('shipping_notes');
            // creating | created | failed | cancelled
            $table->string('shipment_booking', 12)->nullable()->after('shipment_provider');
            $table->unsignedTinyInteger('shipment_attempts')->default(0)->after('shipment_booking');
            $table->timestamp('shipment_claimed_at')->nullable()->after('shipment_attempts');
            $table->string('shipment_order_id', 40)->nullable()->after('shipment_claimed_at');
            $table->string('shipment_id', 40)->nullable()->after('shipment_order_id');
            $table->timestamp('shipment_awb_at')->nullable()->after('shipment_id');
            $table->timestamp('shipment_pickup_at')->nullable()->after('shipment_awb_at');
            $table->timestamp('shipment_cancelled_at')->nullable()->after('shipment_pickup_at');
            $table->string('shipment_label_url', 500)->nullable()->after('shipment_cancelled_at');
            $table->unsignedSmallInteger('shipment_status_id')->nullable()->after('shipment_label_url');
            $table->string('shipment_status', 60)->nullable()->after('shipment_status_id');
            $table->timestamp('shipment_status_at')->nullable()->after('shipment_status');
            // returning | returned | cancelled — a parcel that is not going to arrive
            $table->string('shipment_problem', 16)->nullable()->after('shipment_status_at');
            $table->string('shipment_error', 500)->nullable()->after('shipment_problem');
            $table->timestamp('shipment_checked_at')->nullable()->after('shipment_error');
            $table->timestamp('delivered_at')->nullable()->after('dispatched_at');

            $table->index(['shipment_booking', 'shipment_checked_at'], 'orders_shipment_track_index');
            $table->index('shipment_order_id');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex('orders_shipment_track_index');
            $table->dropIndex(['shipment_order_id']);
            $table->dropColumn([
                'shipment_provider', 'shipment_booking', 'shipment_attempts', 'shipment_claimed_at',
                'shipment_order_id', 'shipment_id', 'shipment_awb_at', 'shipment_pickup_at',
                'shipment_cancelled_at', 'shipment_label_url', 'shipment_status_id', 'shipment_status',
                'shipment_status_at', 'shipment_problem', 'shipment_error', 'shipment_checked_at',
                'delivered_at',
            ]);
        });
    }
};
