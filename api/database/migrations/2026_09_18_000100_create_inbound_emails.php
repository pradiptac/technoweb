<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The ledger of every email the support mailbox handed us, and what became
 * of it.
 *
 * A row per message, keyed by its Message-ID with a UNIQUE index: that index
 * *is* the idempotency. IMAP delivers the same message again after a crash
 * mid-run, after a flag that did not stick, after somebody drags it back
 * into the inbox — and a read-then-write "have we seen this" check passes
 * every test on one thread and mints two tickets the day two runs overlap.
 * A duplicate insert cannot happen, so a redelivered message opens one
 * ticket and sends one acknowledgement whatever the mailbox does.
 *
 * It is also the panel's memory: what was skipped and why (an auto-reply, a
 * bounce, the desk's own notification landing back in the box), what failed,
 * and which ticket a message became. Pruned by age, never by hand.
 *
 * `channel` on tickets and messages says which door something came in by —
 * 'portal' for everything that exists today, so the migration changes no
 * row's meaning.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inbound_emails', function (Blueprint $table) {
            $table->id();
            $table->string('message_id')->unique();
            $table->string('provider', 16);
            $table->unsignedBigInteger('uid')->nullable();
            $table->string('from_email')->index();
            $table->string('from_name')->nullable();
            $table->string('subject')->nullable();
            $table->string('in_reply_to')->nullable();
            $table->timestamp('received_at')->nullable();
            $table->string('outcome', 40)->index();
            $table->string('reason', 500)->nullable();
            $table->foreignId('ticket_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('ticket_message_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();

            $table->index('created_at');
        });

        Schema::table('tickets', function (Blueprint $table) {
            $table->string('channel', 16)->default('portal')->after('priority');
        });

        Schema::table('ticket_messages', function (Blueprint $table) {
            $table->string('channel', 16)->nullable()->after('is_internal');
        });
    }

    public function down(): void
    {
        Schema::table('ticket_messages', fn (Blueprint $table) => $table->dropColumn('channel'));
        Schema::table('tickets', fn (Blueprint $table) => $table->dropColumn('channel'));
        Schema::dropIfExists('inbound_emails');
    }
};
