<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Zoho Books invoices (0.134.0, docs/store.md "Zoho Books invoices").
 *
 * Where an order's invoice in Zoho Books has got to. `zoho_status` is null
 * for an order nothing has been asked of — every order before this, and
 * every order while the integration is off — so the sweeper's query and the
 * console's badge both have nothing to say about them.
 *
 * `zoho_invoice_id` is Zoho's own id, kept so a retry finds the invoice it
 * already made rather than making a second. The invoice's *number* and date
 * go in the `invoice_number` / `invoice_date` columns the uploaded invoice
 * has always used, and its PDF at `invoice_path`: to the customer, and to
 * everything that reads an order, an invoice is an invoice wherever it came
 * from.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            // pending | creating | created | failed | skipped
            $table->string('zoho_status', 16)->nullable()->after('invoice_path');
            $table->string('zoho_invoice_id', 40)->nullable()->after('zoho_status');
            $table->unsignedTinyInteger('zoho_attempts')->default(0)->after('zoho_invoice_id');
            $table->string('zoho_error', 500)->nullable()->after('zoho_attempts');
            $table->timestamp('zoho_claimed_at')->nullable()->after('zoho_error');
            $table->timestamp('zoho_next_attempt_at')->nullable()->after('zoho_claimed_at');
            $table->timestamp('zoho_synced_at')->nullable()->after('zoho_next_attempt_at');

            // The sweeper's one query: what is waiting, and when it is due.
            $table->index(['zoho_status', 'zoho_next_attempt_at'], 'orders_zoho_due_index');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex('orders_zoho_due_index');
            $table->dropColumn([
                'zoho_status', 'zoho_invoice_id', 'zoho_attempts', 'zoho_error',
                'zoho_claimed_at', 'zoho_next_attempt_at', 'zoho_synced_at',
            ]);
        });
    }
};
