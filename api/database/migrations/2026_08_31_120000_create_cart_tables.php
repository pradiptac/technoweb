<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A cart, held by a token rather than by a session.
 *
 * Guest checkout is a requirement, so a cart cannot belong to an account — most
 * of them will never have one. It is identified by a random token the frontend
 * keeps in an httpOnly cookie, exactly as the portal session is: browser
 * JavaScript never sees it, and the Next server sends it on.
 *
 * `customer_id` is nullable and is filled in when a signed-in customer is the
 * one shopping, so their cart survives a device change. It is never the
 * identity — that stays the token, because the identity has to work before
 * anybody has signed in.
 *
 * **No prices are stored here.** Not the unit price, not the subtotal, not the
 * GST. Everything is recomputed from the product on every read, which is the
 * brief's own rule — the frontend is never the authority for a price, and
 * neither is a row somebody put in a cart three weeks ago. It also means a
 * price change reaches an abandoned cart, which is the honest behaviour: the
 * alternative is honouring a figure the shop has since corrected.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('carts', function (Blueprint $table) {
            $table->id();

            // 64 hex characters. Unique because it is the address of the cart.
            $table->string('token', 64)->unique();

            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();

            // Pruning reads this: an abandoned cart is dead weight after a
            // few weeks and holds no information anybody wants.
            $table->index('updated_at');
        });

        Schema::create('cart_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cart_id')->constrained()->cascadeOnDelete();

            /*
             * Cascading on both, deliberately.
             *
             * A cart item is a *pointer* at something for sale, unlike an order
             * item, which is a record of what was sold and keeps its own copy
             * of the name and price. When a product goes, the thing this row
             * points at no longer exists — leaving it would put a line in
             * somebody's cart that cannot be priced or bought.
             */
            $table->foreignId('store_product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('store_product_variation_id')->nullable()->constrained()->cascadeOnDelete();

            $table->unsignedInteger('quantity')->default(1);
            $table->timestamps();

            /*
             * One line per thing.
             *
             * Adding the same switch twice increments a line rather than
             * producing two identical rows the buyer then has to reconcile —
             * and the constraint is what makes that a fact rather than a habit
             * of one code path.
             */
            $table->unique(['cart_id', 'store_product_id', 'store_product_variation_id'], 'cart_items_unique_line');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cart_items');
        Schema::dropIfExists('carts');
    }
};
