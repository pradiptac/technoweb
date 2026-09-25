<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The wishlist: things somebody would like, kept for later.
 *
 * `wishlists` is addressed by a token exactly like a basket — 64 hex
 * characters from `random_bytes`, held by the Next server in an httpOnly
 * cookie — because a guest may keep one. `customer_id` is set once the list
 * belongs to an account, and is **unique**: one list per customer, so signing
 * in merges a guest's list into the account's rather than leaving two. An
 * account's list is never reachable by its token alone (see `Wishlists`),
 * or a shared computer would hand the last person's list to the next.
 *
 * `email` is a guest's own "email me about these" address; an account's
 * messages go to the account. `alerts_token` is what the stop link in those
 * emails carries — never the list's own token, which would let anybody who
 * read the email open and edit the list — and `alerts_off_at` is what that
 * link sets.
 *
 * `wishlist_items` is unique per list, product and variation. MySQL treats
 * NULLs as distinct in a unique index, so "any variation" would slip through
 * it; `variation_key` is the variation's id or `0` for none, and the index is
 * on that — the database refuses the duplicate itself, which a
 * find-before-create cannot promise under two tabs pressing at once.
 *
 * The notice state is stamps, not flags: `awaiting_stock_at` is armed while
 * the shelf is empty and cleared when the holder is told it is back
 * (`back_in_stock_notified_at`); `price_drop_notified_paise` is the price the
 * holder was last told about, so a drop is told once and only a further drop
 * is news. `price_at_save` is what the thing cost when it was saved — the
 * figure a drop is measured from.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wishlists', function (Blueprint $table) {
            $table->id();
            $table->string('token', 64)->unique();
            $table->foreignId('customer_id')->nullable()->unique()->constrained('customers')->cascadeOnDelete();
            $table->string('email', 190)->nullable();
            $table->string('alerts_token', 64)->unique();
            $table->timestamp('alerts_off_at')->nullable();
            $table->timestamps();

            // `technoware:prune-wishlists` ranges guest lists on this.
            $table->index(['customer_id', 'updated_at']);
        });

        Schema::create('wishlist_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wishlist_id')->constrained('wishlists')->cascadeOnDelete();
            $table->foreignId('store_product_id')->constrained('store_products')->cascadeOnDelete();
            $table->foreignId('store_product_variation_id')->nullable()->constrained('store_product_variations')->cascadeOnDelete();
            // Written by `WishlistItem`'s saving hook, never by a caller. Not a
            // generated column: MySQL refuses a CASCADE foreign key on the base
            // column of a stored generated one, and a deleted variation has to
            // take its lines with it.
            $table->unsignedBigInteger('variation_key')->default(0);
            $table->unsignedBigInteger('price_at_save');
            $table->timestamp('awaiting_stock_at')->nullable();
            $table->timestamp('back_in_stock_notified_at')->nullable();
            $table->timestamp('price_drop_notified_at')->nullable();
            $table->unsignedBigInteger('price_drop_notified_paise')->nullable();
            $table->timestamps();

            $table->unique(['wishlist_id', 'store_product_id', 'variation_key'], 'wishlist_items_line_unique');
            // The two jobs and the dashboard read by product.
            $table->index(['store_product_id', 'awaiting_stock_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wishlist_items');
        Schema::dropIfExists('wishlists');
    }
};
