<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What the buyer asked for in their own words, at checkout.
 *
 * **`customer_note`, not `notes`.** `Order::notes()` is already the desk's own
 * staff-only notes relation, and an attribute of that name would shadow it —
 * an `$order->notes` that is sometimes a collection and sometimes a string is
 * the kind of collision nothing reports. The name it has instead says whose
 * words these are, beside `customer_name`, `customer_email` and
 * `customer_phone`, which is what distinguishes it from every other note on an
 * order: this one was written by the person who placed it.
 *
 * Nullable, because it is optional at the form and must stay optional here —
 * a blank box is the ordinary answer.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->text('customer_note')->nullable()->after('customer_phone');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn('customer_note');
        });
    }
};
