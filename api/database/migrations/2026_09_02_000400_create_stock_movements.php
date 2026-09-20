<?php

use App\Enums\ProductType;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A ledger of every change to a stock level.
 *
 * **Half of "stock in and out" was not recorded anywhere.** `stock` is a bare
 * integer on `store_products` and `store_product_variations`, and exactly two
 * things move it: `Settlement::takeStock()` decrements it when an order is
 * paid, and the admin product form writes whatever number somebody typed. The
 * first is derivable after the fact from the order lines; the second leaves no
 * trace at all — a level going from 4 to 40 is indistinguishable from one that
 * was always 40, so "what came in this month" had no answer and could not be
 * given one by querying harder.
 *
 * A counter records the present. A ledger records what happened, which is the
 * thing a stock report is.
 *
 * ## Shape
 *
 * `delta` is **signed** — positive in, negative out — rather than a quantity
 * beside a direction flag. Two columns that must agree is one that can
 * disagree, and every sum in the report is then a plain `SUM(delta)` instead
 * of a `CASE`.
 *
 * `balance_after` is the level this movement left behind, so a row can be read
 * without replaying every row before it. It is **nullable and null for
 * everything backfilled below**, because the levels those movements left
 * behind are gone and inventing them would be worse than admitting it — the
 * rule the dashboard follows for an average of nothing.
 *
 * The product's name, variation and SKU are **snapshotted**, the way an order
 * item snapshots what was sold and the activity log snapshots its actor. A
 * report of what moved last quarter must not change because somebody renamed a
 * product, and `store_product_id` is `nullOnDelete` so deleting a product
 * cannot silently rewrite history that has already been read.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();

            $table->foreignId('store_product_id')->nullable()
                ->constrained('store_products')->nullOnDelete();
            $table->foreignId('store_product_variation_id')->nullable()
                ->constrained('store_product_variations')->nullOnDelete();

            // Snapshots. What moved, as it was called when it moved.
            $table->string('product_name');
            $table->string('variation_name')->nullable();
            $table->string('sku')->nullable();

            $table->integer('delta');
            $table->integer('balance_after')->nullable();
            $table->string('reason', 20);

            // Where it came from. Both nullable: an adjustment has no order and
            // a sale has no person.
            $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->string('order_number')->nullable();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('actor_name')->nullable();

            $table->string('note', 255)->nullable();

            /*
             * `created_at` alone, and it is the report's whole axis — there is
             * no `updated_at` because a ledger row is never edited. Indexed
             * with the product because every screen either asks "what moved in
             * this range" or "what moved for this product", and unindexed both
             * are a full scan of a table that only grows.
             */
            $table->timestamp('created_at')->nullable()->index();
            $table->index(['store_product_id', 'created_at']);
        });

        $this->backfillSales();
    }

    /**
     * Every sale already made, so the report is not empty on the day it ships.
     *
     * Only paid orders, because that is the only moment stock is taken —
     * `Settlement::takeStock()` runs on settlement, not on placement, so an
     * unpaid order has moved nothing. Only physical lines, for the same reason
     * a licence has no stock level to move.
     *
     * `balance_after` stays null throughout: these movements are being written
     * long after the levels they left behind stopped existing.
     */
    private function backfillSales(): void
    {
        /*
         * `paid_at IS NOT NULL` is the one definition of paid in this
         * application — `Order::scopePaid()` is that query, and revenue reads
         * it. A second definition here, however carefully written, is how the
         * newsletter ended up with two answers to "delivered" one click apart.
         */
        DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereNotNull('orders.paid_at')
            ->where('order_items.type', ProductType::Physical->value)
            ->orderBy('order_items.id')
            ->select([
                'order_items.store_product_id',
                'order_items.store_product_variation_id',
                'order_items.name',
                'order_items.variation_name',
                'order_items.sku',
                'order_items.quantity',
                'orders.id as order_id',
                'orders.order_number',
                'orders.paid_at',
            ])
            ->chunk(500, function ($rows) {
                $insert = [];

                foreach ($rows as $row) {
                    $insert[] = [
                        'store_product_id' => $row->store_product_id,
                        'store_product_variation_id' => $row->store_product_variation_id,
                        'product_name' => $row->name,
                        'variation_name' => $row->variation_name,
                        'sku' => $row->sku,
                        'delta' => -1 * (int) $row->quantity,
                        'balance_after' => null,
                        'reason' => 'sale',
                        'order_id' => $row->order_id,
                        'order_number' => $row->order_number,
                        'user_id' => null,
                        'actor_name' => null,
                        'note' => 'Recorded from the order when the ledger was added.',
                        'created_at' => $row->paid_at,
                    ];
                }

                if ($insert !== []) {
                    DB::table('stock_movements')->insert($insert);
                }
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_movements');
    }
};
