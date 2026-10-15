<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What a generated GST invoice needs that the store did not already hold
 * (0.176.0, `docs/store.md` "The GST invoice").
 *
 * Three columns, and the first is the one that matters.
 *
 * **`store_products.hsn`** is the Harmonised System code, and a tax invoice
 * is not compliant without one against each line. It sits on the product and
 * not on the variation deliberately: HSN classifies *what the thing is*, and
 * a 24-port switch and a 48-port switch of the same model are one
 * classification. A blank falls back to the `invoice_hsn_default` setting,
 * and a line with neither prints no code — which the console says, rather
 * than inventing one. Eight characters: HSN is 4, 6 or 8 digits and SAC is 6.
 *
 * **`orders.invoice_source`** records which of the three made the invoice
 * this order carries — `uploaded`, `zoho` or `generated`. Without it the
 * three are indistinguishable the moment they coexist, and "may this order's
 * invoice be replaced" has no answer: a generated one may be re-issued, an
 * uploaded one must never be overwritten by a machine. It is null on every
 * order that predates this, which reads as "we cannot tell" and is treated
 * as uploaded — the safe side.
 *
 * **`orders.invoice_number` gains an index**, because the number series is
 * claimed by reading the highest one issued this financial year under a row
 * lock. Without the index that read is a table scan and the lock is the
 * whole table.
 *
 * ---
 *
 * And the tax itself moves, which is the larger half of this migration.
 *
 * **`store_products.gst_percent`** is the rate for that product, blank
 * meaning the store-wide `store_gst_percent`. On the product rather than the
 * variation for the same reason as `hsn`: a rate classifies what the thing
 * is, and two sizes of one switch are one classification.
 *
 * **`order_items` gains `gst_basis_points`, `taxable_paise` and
 * `gst_paise`** — the rate that line was charged at and the two figures that
 * came out of it, snapshotted like the name, the SKU and the price beside
 * them. This **reverses** what the original schema said, and the reversal is
 * the point rather than an oversight:
 *
 *     "GST is stored at the order, not per line. Apportioning tax across
 *      lines means rounding each one, and rounded lines do not add up to the
 *      rounding of the total — so the invoice would disagree with the amount
 *      charged."
 *
 * That was exactly right while there was one rate, because the only way to
 * get a per-line figure was to divide a rounded total. With a rate per
 * product the arithmetic runs the other way: each line's tax is computed
 * from that line's own money at that line's own rate, and the order's
 * `taxable_paise` and `gst_paise` become the **sum** of the lines. They add
 * up by construction, and there is no apportionment of a rounded figure
 * anywhere. What *is* apportioned — the order-level discount and the
 * delivery charge — is apportioned in paise with the largest-remainder rule,
 * so the parts sum exactly to the whole before any tax is taken.
 *
 * Nullable, not defaulted. Null means "placed before this existed", and the
 * invoice for such an order derives one rate for the whole of it from the
 * two columns it does have (`Money::rateOf`) rather than pretending to a
 * per-line breakdown nobody recorded.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('store_products', function (Blueprint $table) {
            $table->string('hsn', 8)->nullable()->after('mpn');
            $table->string('gst_percent', 8)->nullable()->after('hsn');
        });

        Schema::table('order_items', function (Blueprint $table) {
            $table->unsignedSmallInteger('gst_basis_points')->nullable()->after('line_total_paise');
            $table->unsignedBigInteger('taxable_paise')->nullable()->after('gst_basis_points');
            $table->unsignedBigInteger('gst_paise')->nullable()->after('taxable_paise');
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->string('invoice_source', 16)->nullable()->after('invoice_path');
            $table->index('invoice_number');
        });
    }

    public function down(): void
    {
        Schema::table('store_products', function (Blueprint $table) {
            $table->dropColumn(['hsn', 'gst_percent']);
        });

        Schema::table('order_items', function (Blueprint $table) {
            $table->dropColumn(['gst_basis_points', 'taxable_paise', 'gst_paise']);
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex(['invoice_number']);
            $table->dropColumn('invoice_source');
        });
    }
};
