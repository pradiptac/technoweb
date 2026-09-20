<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Discount codes, kept deliberately simple.
 *
 * The brief lists what *not* to build here and the list is longer than what to:
 * no bundles, no buy-one-get-one, no tiered discounts, no customer-segment
 * pricing, no flash-sale engine. A percentage or an amount off, with the
 * ordinary guards around it.
 *
 * **Usage is a table, not a counter.** A `used_count` column cannot answer "has
 * *this person* used it", which is the per-customer limit — and it cannot be
 * made concurrency-safe without a lock that a row insert gets for free from a
 * unique index. `coupon_usages` records one row per order, so the limits are
 * both counts of real things rather than a number somebody increments.
 *
 * Money is paise, as everywhere. `value` is either paise or a percentage
 * depending on `type`, which is the one place in the store where a number means
 * two things — worth the small ugliness, because the alternative is two nullable
 * columns of which exactly one is ever set.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('coupons', function (Blueprint $table) {
            $table->id();

            /*
             * Stored upper-case and matched upper-case.
             *
             * Nobody types a coupon the way it was printed, and a code that
             * works on the poster and not in the box is a support call. The
             * unique index is on the normalised form so "WELCOME10" and
             * "welcome10" cannot both exist.
             */
            $table->string('code', 64)->unique();

            $table->string('type', 16)->default('percentage');
            // Percentage: 10 means 10%. Fixed: paise.
            $table->unsignedBigInteger('value');

            $table->unsignedBigInteger('minimum_order_paise')->nullable();
            /*
             * The ceiling on a percentage discount, and the reason it exists:
             * "20% off" against an order for a rack of switches is a discount
             * nobody authorised. Meaningless for a fixed amount, and null there.
             */
            $table->unsignedBigInteger('maximum_discount_paise')->nullable();

            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();

            // Null means no limit, which is different from zero — zero would be
            // a coupon nobody can use, and that is what `is_active` is for.
            $table->unsignedInteger('usage_limit')->nullable();
            $table->unsignedInteger('per_customer_limit')->nullable();

            $table->boolean('is_active')->default(true);
            $table->string('description')->nullable();
            $table->timestamps();

            $table->index(['is_active', 'ends_at']);
        });

        Schema::create('coupon_usages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('coupon_id')->constrained()->cascadeOnDelete();

            /*
             * `nullOnDelete`, so deleting an order does not un-use a coupon.
             *
             * The usage happened. Losing the record because the order was
             * tidied away would let a single-use code be used twice, which is
             * the one thing this table exists to prevent.
             */
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();

            /*
             * The address is the identity, not the customer id.
             *
             * Guest checkout means most orders have no account at the moment
             * the coupon is used — an account is created afterwards, on
             * payment. Keying the per-customer limit on `customer_id` would
             * therefore let one person use a "once per customer" code as many
             * times as they liked simply by not signing in.
             */
            $table->string('email', 190);

            $table->unsignedBigInteger('discount_paise');
            $table->timestamp('created_at')->nullable();

            $table->index(['coupon_id', 'email']);
            /*
             * One usage per order, enforced rather than assumed. Two settlement
             * paths, a retried webhook or a double-pressed button would
             * otherwise each write a row and burn a single-use code twice over.
             */
            $table->unique(['coupon_id', 'order_id']);
        });

        Schema::table('carts', function (Blueprint $table) {
            /*
             * The code, on the cart, as typed.
             *
             * Not the discount — never the discount. A basket stores nothing
             * about money, so the coupon is re-validated and re-applied on
             * every read; an amount stored here would go stale the moment
             * somebody added another line, and stale in the customer's favour
             * is a discount the shop did not agree to.
             */
            $table->string('coupon_code', 64)->nullable()->after('customer_id');
        });
    }

    public function down(): void
    {
        Schema::table('carts', function (Blueprint $table) {
            $table->dropColumn('coupon_code');
        });

        Schema::dropIfExists('coupon_usages');
        Schema::dropIfExists('coupons');
    }
};
