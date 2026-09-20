<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Orders, payments and the trail behind them.
 *
 * Three decisions run through the whole of this.
 *
 * **An order item is a snapshot, not a pointer.** A cart line points at
 * something for sale and is repriced on every read; an order item records what
 * was *sold*, so it keeps its own copy of the name, the part number, the
 * options and the price. A product renamed or repriced a year later must not
 * change what an invoice says, and a product deleted must not take the record
 * of having sold it with it — hence `nullOnDelete` on the product reference
 * rather than a cascade.
 *
 * **GST is stored at the order, not per line.** Apportioning tax across lines
 * means rounding each one, and rounded lines do not add up to the rounding of
 * the total — so the invoice would disagree with the amount charged, which is
 * the one thing `App\Support\Money` exists to prevent. A per-line breakdown, if
 * it is ever wanted, is an apportionment at render time and not a second set of
 * stored figures free to drift.
 *
 * **An order is reachable without an account.** Guest checkout is a
 * requirement, so `access_token` addresses it from the confirmation email. A
 * portal account is created automatically on payment, but somebody who has not
 * signed in yet still has to be able to see what they bought.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders', function (Blueprint $table) {
            $table->id();

            // ORD-2026-00001. Human-quotable, and what a customer reads out on
            // the telephone -- the same shape as a ticket reference.
            $table->string('order_number', 32)->unique();

            /*
             * Nullable, and filled in the moment there is an account.
             *
             * A guest order is not an orphan: `customer_email` is on the row,
             * and the account created on payment is linked here. Nullable
             * because the order exists before the account does, and because a
             * customer deleted later must not take their order history with
             * them -- an order is a financial record.
             */
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();

            // See `App\Enums\OrderStatus`. A varchar, not an ENUM: the lifecycle
            // is branched on in PHP and MySQL's ENUM cannot be extended without
            // an ALTER.
            $table->string('status', 32)->default('pending_payment');

            // Every amount in paise, as an integer. See `App\Support\Money`.
            $table->unsignedBigInteger('subtotal_paise');
            $table->unsignedBigInteger('discount_paise')->default(0);
            $table->unsignedBigInteger('taxable_paise');
            $table->unsignedBigInteger('gst_paise');
            $table->unsignedBigInteger('total_paise');

            $table->foreignId('coupon_id')->nullable();
            // Copied, not joined: a coupon renamed or deleted afterwards must
            // not change what this order says was applied.
            $table->string('coupon_code', 64)->nullable();

            $table->string('customer_name');
            $table->string('customer_email');
            $table->string('customer_phone', 32)->nullable();

            /*
             * Addresses as JSON of a fixed shape: line1, line2, city, state,
             * pin, country. Read by name, so MySQL's key reordering cannot
             * hurt — unlike a spec sheet, where the order *is* the content.
             *
             * `shipping_address` is null for an order with nothing to ship,
             * which is the honest representation: a digital licence has no
             * delivery address, and copying the billing one there would put a
             * courier label on something that never travels.
             */
            $table->json('billing_address')->nullable();
            $table->json('shipping_address')->nullable();

            // Optional, and never verified against a government API -- the
            // brief rules that out. Stored for the invoice somebody prepares.
            $table->boolean('gst_required')->default(false);
            $table->string('gstin', 20)->nullable();
            $table->string('company_name')->nullable();

            /*
             * The invoice is prepared by hand, outside this system.
             *
             * So these are three fields an administrator fills in, not the
             * output of a generator. The brief is explicit that no GST invoice
             * is produced here, and building one anyway would be a document
             * with legal weight that nobody asked this software to stand
             * behind.
             */
            $table->string('invoice_number', 64)->nullable();
            $table->date('invoice_date')->nullable();
            $table->string('invoice_path')->nullable();

            /*
             * Dispatch, entered by hand. No courier API, by the brief.
             *
             * `tracking_url` is what the customer clicks, and it is validated
             * on write for the same reason the contact page's map embed is:
             * an unchecked URL on a page of ours is somebody else's page.
             */
            $table->string('courier', 120)->nullable();
            $table->string('tracking_number', 120)->nullable();
            $table->string('tracking_url', 500)->nullable();
            $table->text('shipping_notes')->nullable();

            /*
             * How a guest reaches their own order.
             *
             * 64 hex characters from a cryptographic source, in the link the
             * confirmation email carries. Not the order number: that is
             * printed on paperwork, quoted on the telephone and sequential,
             * so anything it unlocked would be unlocked for the next person
             * who counted upwards.
             */
            $table->string('access_token', 64)->unique();

            $table->timestamp('placed_at')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamp('dispatched_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'created_at']);
            $table->index('customer_email');
        });

        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();

            // Kept as a reference for reporting, and never relied on for what
            // the line says. `nullOnDelete`, because deleting a product must
            // not delete the record of having sold it.
            $table->foreignId('store_product_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('store_product_variation_id')->nullable()->constrained()->nullOnDelete();

            // The snapshot. Everything a person needs to read the line back
            // in five years, with no join at all.
            $table->string('name');
            $table->string('variation_name')->nullable();
            $table->string('sku')->nullable();
            $table->json('options')->nullable();
            $table->string('type', 16)->default('physical');

            $table->unsignedInteger('quantity');
            $table->unsignedBigInteger('unit_price_paise');
            $table->unsignedBigInteger('line_total_paise');

            // A term of the sale, frozen. Making a product returnable next
            // month does not retrospectively change what was agreed.
            $table->boolean('returnable')->default(true);

            $table->timestamps();
        });

        /*
         * Every consequential change, in order.
         *
         * The same argument the activity log is built on: a status somebody
         * disputes is a question about *when* and *who*, and a single column
         * holding the current value cannot answer either.
         */
        Schema::create('order_status_history', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->string('from_status', 32)->nullable();
            $table->string('to_status', 32);
            $table->text('note')->nullable();

            // The actor's name is copied for the reason the activity log copies
            // it: a trail that forgets who did something once they leave has
            // failed at the point it is being read.
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('actor_name')->nullable();

            $table->timestamp('created_at')->nullable();
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();

            $table->string('gateway', 32);

            /*
             * The gateway's own identifiers.
             *
             * `gateway_payment_id` is **unique** and that is the whole of the
             * idempotency: a webhook that arrives three times, which they do,
             * must not mark an order paid three times, assign three activation
             * codes or reduce stock three times. A unique index makes the
             * second insert impossible rather than unlikely.
             */
            $table->string('gateway_order_id', 191)->nullable();
            $table->string('gateway_payment_id', 191)->nullable()->unique();
            $table->string('signature', 500)->nullable();

            $table->unsignedBigInteger('amount_paise');
            $table->string('currency', 8)->default('INR');
            $table->string('status', 32)->default('pending');
            $table->string('method', 64)->nullable();
            $table->text('failure_reason')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();

            $table->index(['order_id', 'status']);
        });

        /*
         * Staff notes on an order, which are not the status trail.
         *
         * Separate because they are different things: the trail is what
         * happened, and a note is what somebody wants a colleague to know. The
         * ticket module keeps the same split for the same reason, and there it
         * is load-bearing — an internal note must never reach a customer.
         */
        Schema::create('order_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('actor_name')->nullable();
            $table->text('body');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_notes');
        Schema::dropIfExists('payments');
        Schema::dropIfExists('order_status_history');
        Schema::dropIfExists('order_items');
        Schema::dropIfExists('orders');
    }
};
