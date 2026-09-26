<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Abandoned baskets: who to remind, how often it has happened, and whether it
 * worked.
 *
 * `email` and `phone` are what the checkout typed on blur (`PATCH
 * /cart/contact`), before any order exists — which is the whole point: the
 * basket that is abandoned is the one that never became an order.
 * `contact_consent_at` is when that address was given *beside the line saying
 * a reminder may follow*; a guest address without it is never mailed.
 *
 * `reminders_sent` is the state machine (0, 1, 2) and `last_reminded_at` its
 * clock. `recovered_order_id` is stamped by the checkout on the basket it
 * ordered from — it is what stops reminders, and it counts as a *recovery* on
 * the dashboard only when a reminder had gone out first.
 *
 * `restore_token` is the capability in the reminder's link. It is never the
 * cart token itself: that one is the basket's identity and lives in an
 * httpOnly cookie, and an email is a far leakier place than a cookie jar.
 * Minted with the first reminder, so the column is null for almost every row.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('carts', function (Blueprint $table) {
            $table->string('email', 190)->nullable()->after('customer_id');
            $table->string('phone', 32)->nullable()->after('email');
            $table->timestamp('contact_consent_at')->nullable()->after('phone');
            $table->unsignedTinyInteger('reminders_sent')->default(0)->after('coupon_code');
            $table->timestamp('last_reminded_at')->nullable()->after('reminders_sent');
            $table->foreignId('recovered_order_id')->nullable()->after('last_reminded_at')
                ->constrained('orders')->nullOnDelete();
            $table->string('restore_token', 64)->nullable()->unique()->after('recovered_order_id');

            /*
             * What `technoware:remind-abandoned-carts` asks every ten minutes:
             * not recovered, at this many reminders, idle since before this
             * moment. Equality first, the range last.
             */
            $table->index(['recovered_order_id', 'reminders_sent', 'updated_at'], 'carts_reminder_due');

            // The dashboard's window: baskets reminded since a date.
            $table->index('last_reminded_at');
        });
    }

    public function down(): void
    {
        Schema::table('carts', function (Blueprint $table) {
            // The foreign key first: MySQL will not drop an index a
            // constraint is leaning on, and the composite one may be it.
            $table->dropForeign(['recovered_order_id']);
            $table->dropIndex('carts_reminder_due');
            $table->dropIndex(['last_reminded_at']);
            $table->dropUnique(['restore_token']);
            $table->dropColumn([
                'email', 'phone', 'contact_consent_at', 'reminders_sent',
                'last_reminded_at', 'recovered_order_id', 'restore_token',
            ]);
        });
    }
};
