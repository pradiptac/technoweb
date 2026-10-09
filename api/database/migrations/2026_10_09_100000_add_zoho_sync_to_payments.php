<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Where a payment stands in Zoho Books (0.136.0, docs/store.md "Zoho Books:
 * payments and credit notes").
 *
 * The same shape `orders` was given for its invoice, on the row the money is
 * recorded on: a status claimed by a conditional UPDATE, what Zoho made, how
 * often it was tried and when it is due again. One table for both directions
 * — a `paid` row becomes a customer payment, a `refunded` row a credit note —
 * because both are a row here already and the question asked of each is the
 * same: has Zoho been told.
 *
 * `zoho_id` is the customer payment's id, or the credit note's; a credit
 * note that had to be paid back out of an account also has the refund Zoho
 * recorded against it, in `zoho_refund_id`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            // pending | sending | sent | failed | skipped
            $table->string('zoho_status', 16)->nullable()->after('note');
            $table->string('zoho_id', 40)->nullable()->after('zoho_status');
            $table->string('zoho_number', 64)->nullable()->after('zoho_id');
            $table->string('zoho_refund_id', 40)->nullable()->after('zoho_number');
            $table->unsignedTinyInteger('zoho_attempts')->default(0)->after('zoho_refund_id');
            $table->string('zoho_error', 500)->nullable()->after('zoho_attempts');
            $table->timestamp('zoho_claimed_at')->nullable()->after('zoho_error');
            $table->timestamp('zoho_next_attempt_at')->nullable()->after('zoho_claimed_at');
            $table->timestamp('zoho_synced_at')->nullable()->after('zoho_next_attempt_at');

            // The sweeper's query: what is waiting, and when it is due.
            $table->index(['zoho_status', 'zoho_next_attempt_at'], 'payments_zoho_due_index');
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->dropIndex('payments_zoho_due_index');
            $table->dropColumn([
                'zoho_status', 'zoho_id', 'zoho_number', 'zoho_refund_id', 'zoho_attempts', 'zoho_error',
                'zoho_claimed_at', 'zoho_next_attempt_at', 'zoho_synced_at',
            ]);
        });
    }
};
