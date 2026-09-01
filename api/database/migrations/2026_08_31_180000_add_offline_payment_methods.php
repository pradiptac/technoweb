<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Paying without a gateway.
 *
 * Cash on delivery, a bank transfer and UPI all end the same way: a person
 * reads a bank statement, or takes cash from a courier, and says the money
 * arrived. That is a different act from a signed callback, and it needs three
 * things the schema did not have.
 *
 * **`orders.payment_method`** — what the customer chose. Not derivable from the
 * payments table, because an offline order has no payment row until somebody
 * confirms one, and "which instructions do we show" has to be answerable before
 * that.
 *
 * **`payments.reference`** — the UTR, the UPI transaction id, the receipt
 * number. It is the only thing that ties a row on a bank statement to an order,
 * and without it a confirmation is somebody's word.
 *
 * **`payments.confirmed_by`** — who said so. A gateway payment answers for
 * itself; a manual one is a person's judgement and the trail has to name them.
 * `nullOnDelete`, because a staff member leaving must not take the payment
 * record with them — the same rule the activity log follows for its actor.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->string('payment_method', 32)->default('gateway')->after('status');
        });

        Schema::table('payments', function (Blueprint $table) {
            /*
             * Not unique, unlike `gateway_payment_id`.
             *
             * That column is a gateway's own identifier and its uniqueness is
             * what makes a webhook idempotent. This one is typed by a person
             * off a bank statement, and a shop that takes two payments against
             * one UTR — a part payment and the balance — is doing something
             * ordinary. The refusal to double-record belongs in the controller,
             * where it can say why, not in an index that would fail at the
             * database with nothing readable to show.
             */
            $table->string('reference', 191)->nullable()->after('gateway_payment_id');
            $table->foreignId('confirmed_by')->nullable()->after('reference')
                ->constrained('users')->nullOnDelete();
            $table->text('note')->nullable()->after('failure_reason');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn('payment_method');
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('confirmed_by');
            $table->dropColumn(['reference', 'note']);
        });
    }
};
