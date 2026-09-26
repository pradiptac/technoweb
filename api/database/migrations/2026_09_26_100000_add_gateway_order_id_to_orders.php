<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which gateway order was opened for this order.
 *
 * Razorpay's browser return is signed over `order_id|payment_id`, and the
 * signature proves only that Razorpay issued that pair — not which of *our*
 * orders the Razorpay order was opened for. Nothing recorded the answer, so a
 * triple from a ₹1 order posted to `/orders/{dear}/verify` verified and paid
 * the dear one. The session writes the id here when it opens one, and the
 * return is refused unless it names this id.
 *
 * On the order rather than as a `pending` payment row: a payment row is
 * money that moved, and the reports, the refund ceiling and "paid" all read
 * that table. A gateway order is an intent, and the latest one is the only
 * one a browser should be coming back from.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->string('gateway_order_id', 191)->nullable()->after('payment_method');
            $table->index('gateway_order_id');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex(['gateway_order_id']);
            $table->dropColumn('gateway_order_id');
        });
    }
};
