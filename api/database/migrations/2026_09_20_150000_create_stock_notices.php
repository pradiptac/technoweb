<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Email me when this is back": one row per address per shelf.
 *
 * Keyed on the product, the variation (null for "any") and the address —
 * a repeat request is the same row re-armed, never a second one, so one
 * person asking three times is told once. `notified_at` is the whole of
 * the state: null is waiting, set is told, cleared again is re-armed.
 *
 * `token` is what the cancel link in the email carries — 64 hex characters
 * from `random_bytes`, the shape a conversation and an order use, because
 * a link that removes somebody from a list must not be guessable from the
 * row id. `customer_id` is stamped when a signed-in customer asked, and
 * only then; most requests come from nobody the shop knows.
 *
 * MySQL treats NULLs as distinct in a unique index, so the index alone does
 * not stop two "any variation" rows for one address — `StockNotice::arm()`
 * finds before it creates, and the index is the guard for the case the
 * database can see.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_notices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_product_id')->constrained('store_products')->cascadeOnDelete();
            $table->foreignId('store_product_variation_id')->nullable()->constrained('store_product_variations')->cascadeOnDelete();
            $table->string('email', 190);
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->string('token', 64)->unique();
            $table->timestamp('notified_at')->nullable();
            $table->timestamps();

            $table->unique(['store_product_id', 'store_product_variation_id', 'email'], 'stock_notices_shelf_email_unique');
            $table->index(['store_product_id', 'notified_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_notices');
    }
};
