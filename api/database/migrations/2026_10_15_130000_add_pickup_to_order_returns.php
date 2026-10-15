<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Return pickups (0.159.0, docs/store.md "Return pickups"): the courier
 * collecting an approved return from the customer. The `orders.shipment_*`
 * columns again, one set per return: `pickup_booking` is the claim (creating
 * | created | failed | cancelled), the two Shiprocket ids, the AWB, and the
 * courier's own status — which never touches `order_returns.status`; Receive
 * stays a person's tick.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('order_returns', function (Blueprint $table) {
            $table->string('pickup_booking', 12)->nullable()->after('closed_at');
            $table->unsignedTinyInteger('pickup_attempts')->default(0)->after('pickup_booking');
            $table->timestamp('pickup_claimed_at')->nullable()->after('pickup_attempts');
            $table->string('pickup_sr_order_id', 40)->nullable()->after('pickup_claimed_at');
            $table->string('pickup_shipment_id', 40)->nullable()->after('pickup_sr_order_id');
            $table->string('pickup_awb', 120)->nullable()->after('pickup_shipment_id');
            $table->string('pickup_courier', 120)->nullable()->after('pickup_awb');
            $table->unsignedSmallInteger('pickup_status_id')->nullable()->after('pickup_courier');
            $table->string('pickup_status', 60)->nullable()->after('pickup_status_id');
            $table->timestamp('pickup_status_at')->nullable()->after('pickup_status');
            $table->string('pickup_error', 500)->nullable()->after('pickup_status_at');
            $table->timestamp('pickup_requested_at')->nullable()->after('pickup_error');
            $table->timestamp('pickup_checked_at')->nullable()->after('pickup_requested_at');

            $table->index('pickup_sr_order_id');
            $table->index('pickup_awb');
        });
    }

    public function down(): void
    {
        Schema::table('order_returns', function (Blueprint $table) {
            $table->dropIndex(['pickup_sr_order_id']);
            $table->dropIndex(['pickup_awb']);
            $table->dropColumn([
                'pickup_booking', 'pickup_attempts', 'pickup_claimed_at', 'pickup_sr_order_id', 'pickup_shipment_id',
                'pickup_awb', 'pickup_courier', 'pickup_status_id', 'pickup_status', 'pickup_status_at',
                'pickup_error', 'pickup_requested_at', 'pickup_checked_at',
            ]);
        });
    }
};
