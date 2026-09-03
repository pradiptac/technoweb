<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What the customer typed at the last checkout, so the next one is prefilled.
 *
 * A ticket customer and a store customer are the same row — one `customers`
 * table, one login — so these belong on the account rather than in a second
 * table keyed on the same person.
 *
 * **The last one used, not a history.** An order already keeps its own
 * immutable copy of what it was billed and shipped to; that is what an invoice
 * reads, and it must never change when somebody moves. These columns are a
 * convenience for the *next* form, which is why overwriting them on each order
 * is right rather than lossy.
 *
 * `shipping_address` is its own column because the two are genuinely allowed
 * to differ — an office that is billed and a site that is delivered to. It
 * stays null while they are the same, which is the default.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->json('billing_address')->nullable()->after('phone');
            $table->json('shipping_address')->nullable()->after('billing_address');
            // Fifteen characters, and validated for shape at the checkout —
            // never against a government API, which would put an uncontrolled
            // network call on the request path.
            $table->string('gstin', 15)->nullable()->after('shipping_address');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn(['billing_address', 'shipping_address', 'gstin']);
        });
    }
};
