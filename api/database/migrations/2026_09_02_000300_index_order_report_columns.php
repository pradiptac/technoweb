<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The two columns the store's whole reporting layer filters on, and neither
 * was indexed.
 *
 * `SalesReport` ranges on `placed_at` — deliberately, because that is when the
 * order was placed rather than when the row was written — and `Order::scopePaid()`
 * reads `paid_at`, which is what separates revenue from an abandoned basket.
 * Between them they are eleven query sites across `SalesReport` and
 * `StoreMetrics`, which is every figure on the dashboard and every row of every
 * report.
 *
 * Measured before this migration: `EXPLAIN` on the report's own range query
 * returned `type=ALL, key=NULL` — a full table scan of `orders` for each one.
 * Invisible at ten orders and linear in the table from then on, on the screens
 * that are already the slowest in the console.
 *
 * Two single-column indexes rather than one composite, because the two
 * predicates are used apart as often as together: the dashboard asks
 * `paid_at IS NOT NULL` with no date range, and the CSV export ranges on
 * `placed_at` without it. A composite would serve one of those and not the
 * other, and `IS NOT NULL` is a range condition, so it would stop the optimiser
 * using a second column for the date range anyway.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->index('placed_at');
            $table->index('paid_at');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex(['placed_at']);
            $table->dropIndex(['paid_at']);
        });
    }
};
