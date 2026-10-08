<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Returns (0.132.0, docs/store.md "Returns"): a customer asks to send back
 * lines of a delivered order, and the desk decides.
 *
 * Three tables. The request itself; the lines it names, each pointing at the
 * order line it is a return *of* (an order line is a snapshot, so the name
 * and the price are read from there and never copied a second time); and the
 * photographs, which live on the private disk and are streamed to staff.
 *
 * `order_returns`, not `returns`: `return` is a word PHP keeps for itself.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_returns', function (Blueprint $table) {
            $table->id();
            $table->string('reference', 24)->unique();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->string('status', 16)->default('requested');
            $table->string('reason', 32);
            // The customer's own words. Plain text.
            $table->text('details')->nullable();
            // What the desk told the customer with its decision, and what it
            // wrote for colleagues. Two columns, because one of them is mailed.
            $table->text('decision_note')->nullable();
            $table->text('staff_note')->nullable();
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            // The refund this return ended in — a `payments` row, the one
            // `ManualRefund` writes. Nothing here calls a gateway.
            $table->foreignId('refund_payment_id')->nullable()->constrained('payments')->nullOnDelete();
            $table->unsignedBigInteger('refund_paise')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('rejected_at')->nullable();
            $table->timestamp('received_at')->nullable();
            $table->timestamp('refunded_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'created_at']);
        });

        Schema::create('order_return_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_return_id')->constrained('order_returns')->cascadeOnDelete();
            $table->foreignId('order_item_id')->constrained('order_items')->cascadeOnDelete();
            $table->unsignedInteger('quantity');
            // What actually arrived, and how much of it went back on the shelf.
            $table->unsignedInteger('received_quantity')->nullable();
            $table->unsignedInteger('restocked_quantity')->default(0);

            $table->unique(['order_return_id', 'order_item_id']);
        });

        Schema::create('order_return_photos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_return_id')->constrained('order_returns')->cascadeOnDelete();
            $table->string('path');
            $table->string('name', 180);
            $table->unsignedBigInteger('size')->default(0);
            $table->string('mime', 120)->nullable();
            $table->timestamp('created_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_return_photos');
        Schema::dropIfExists('order_return_items');
        Schema::dropIfExists('order_returns');
    }
};
