<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Activation codes, and the one rule that matters: **a code is assigned once.**
 *
 * Not "should be", and not enforced by whoever writes the assignment. The
 * uniqueness of `order_item_id` on an *assigned* row is what makes two orders
 * receiving one code impossible rather than unlikely — the same reasoning as
 * the unique `gateway_payment_id` behind payment idempotency. A webhook
 * delivered three times, two workers draining a queue, somebody pressing a
 * button twice: every one of those is a real way the naive version issues the
 * same licence to two customers, and the only defence that holds under
 * concurrency is the database refusing the second write.
 *
 * **The code itself is encrypted at rest.** It is commercial stock — a
 * database read, a backup on somebody's laptop or a leaked dump is otherwise a
 * pile of licences somebody can sell. Laravel's `encrypted` cast uses the
 * application key, which means a rotated `APP_KEY` makes every unsold code
 * unreadable; that is the trade, it is the same one the SMTP password already
 * makes, and it is written down in `docs` rather than discovered.
 *
 * `code_fingerprint` is a SHA-256 of the code, and exists for the one thing
 * encryption takes away: recognising a duplicate. Two identical codes uploaded
 * twice is an ordinary import mistake, and without a fingerprint it cannot be
 * caught — encrypted values differ every time, so a unique index on the
 * ciphertext catches nothing at all.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('digital_codes', function (Blueprint $table) {
            $table->id();

            $table->foreignId('store_product_id')->constrained()->cascadeOnDelete();

            // Encrypted. Never selected into a listing, never logged.
            $table->text('code');

            /*
             * SHA-256 of the code, so a duplicate can be recognised without
             * decrypting anything. Unique per product rather than globally: two
             * different products legitimately having the same key string is
             * unlikely and not impossible, and refusing it would be this
             * system inventing a rule about somebody else's licences.
             */
            $table->char('code_fingerprint', 64);

            $table->string('status', 16)->default('available');

            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();

            /*
             * **Not unique**, and the first cut of this had it wrong.
             *
             * A line for three licences needs three codes, all pointing at the
             * same order item — so a unique index here does not enforce
             * "issued once", it enforces "one licence per order line", which is
             * a different and incorrect rule. It failed the moment a test
             * bought three.
             *
             * What actually guarantees a code is assigned once is the
             * conditional `UPDATE ... WHERE status = 'available'` in
             * `DigitalFulfilment::claim()` with the affected row count checked,
             * and the order line held under a lock while its codes are issued.
             * A constraint enforcing the wrong invariant is worse than none: it
             * looks like safety and buys a bug.
             */
            $table->foreignId('order_item_id')->nullable()->constrained()->nullOnDelete();

            $table->timestamp('assigned_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            // Recorded because the brief asks for reveals to be auditable: a
            // customer saying they never received a code, against a row saying
            // it was revealed twice from their own account, is the whole of
            // that conversation.
            $table->timestamp('revealed_at')->nullable();
            $table->unsignedInteger('reveal_count')->default(0);

            $table->text('note')->nullable();
            $table->timestamps();

            $table->unique(['store_product_id', 'code_fingerprint']);
            // "Which codes belong to this line" is asked on every order read.
            $table->index('order_item_id');
            // "How many are left for this product" is asked on every order and
            // on every listing.
            $table->index(['store_product_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('digital_codes');
    }
};
