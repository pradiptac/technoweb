<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Somebody who unsubscribed, asking to come back.
 *
 * The signup form answers every address alike, so an address on the
 * do-not-mail list for its own unsubscribe gets the same 202 and, besides it,
 * an email asking them to confirm — and only the confirmation lifts the
 * suppression. This table is both halves of that: the pending question and,
 * once `confirmed_at` is stamped, the record that the person themselves
 * reversed their decision, and when. Confirmed rows are kept for that reason;
 * a stale unconfirmed row is replaced by the next request for the address.
 *
 * `token_hash` is the SHA-256 of the 64 random characters the link carries,
 * never the token itself — a database read yields no working link, the rule
 * `sign_in_codes` and the portal's email confirmation follow. `group_ids` and
 * `details` are what the new signup asked for (the groups, the name), applied
 * only on confirmation: nothing about the address changes before then.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('newsletter_rejoin_requests', function (Blueprint $table) {
            $table->id();
            $table->string('email', 190);
            $table->char('token_hash', 64)->unique();
            $table->json('group_ids')->nullable();
            $table->json('details')->nullable();
            $table->timestamp('expires_at');
            $table->timestamp('confirmed_at')->nullable();
            $table->timestamps();

            // "Has this address been sent a confirmation in the last day?" —
            // the throttle's question, asked on every suppressed signup.
            $table->index(['email', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('newsletter_rejoin_requests');
    }
};
