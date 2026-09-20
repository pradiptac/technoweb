<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Outgoing webhooks: where to tell somebody else's system that something
 * happened here, and the record of every attempt to.
 *
 * `webhooks` is the subscription — a name, an https URL, the events it wants
 * and a shared secret. The secret is stored through the `encrypted` cast and
 * shown to a person exactly once, on the response that created it; after that
 * the console can say only that one is set, the rule the SMTP password follows.
 *
 * `webhook_deliveries` is the ledger: one row per hook per event, written in
 * the same transaction as the thing it announces, so a checkout that rolls
 * back leaves no `order.placed` behind. The row is the unit of retry — the
 * queued job carries only its id — and the payload is kept on it so a
 * redelivery sends exactly what the first attempt sent, not what the record
 * looks like now. Pruned at thirty days by `technoware:prune-webhook-deliveries`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('webhooks', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->string('url', 2048);
            $table->text('secret');
            $table->json('events');
            $table->boolean('is_active')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('last_delivered_at')->nullable();
            $table->string('last_error', 500)->nullable();
            $table->timestamps();
        });

        Schema::create('webhook_deliveries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('webhook_id')->constrained()->cascadeOnDelete();
            $table->string('event', 40);
            $table->json('payload');
            $table->string('status', 16)->default('pending');
            $table->unsignedInteger('attempts')->default(0);
            $table->unsignedSmallInteger('response_status')->nullable();
            $table->string('response_excerpt', 500)->nullable();
            $table->timestamp('next_attempt_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamps();

            // The delivery log is read newest-first per hook, and pruned by age.
            $table->index(['webhook_id', 'created_at']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('webhook_deliveries');
        Schema::dropIfExists('webhooks');
    }
};
