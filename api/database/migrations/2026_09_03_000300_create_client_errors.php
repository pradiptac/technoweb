<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * JavaScript failures, reported by the browser they happened in.
 *
 * Both error boundaries carried `console.error(error)` and a
 * `TODO(phase 6): forward to an error tracker` — so a crash on somebody else's
 * machine was recorded in a console nobody was looking at, on a device we do
 * not have. Nothing else in the product knew it had happened.
 *
 * **Grouped by fingerprint, not listed by occurrence.** Forty people hitting
 * one bug is one piece of work, and an ungrouped list is one where the most
 * important row is the hardest to see — the same call `/admin/chat/unanswered`
 * makes about questions. So a row is a distinct failure with a count and two
 * timestamps, and the two that matter are *first seen* (did this arrive with
 * the last deploy?) and *last seen* (is it still happening?).
 *
 * Not the activity log. That is an append-only record of what **staff did**,
 * and its own docblock argues for keeping routine noise out of it; a visitor's
 * browser throwing is not an action by a person.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('client_errors', function (Blueprint $table) {
            $table->id();

            /*
             * The identity of a *bug*, not of an occurrence.
             *
             * A hash of the area, the message and Next's own `digest`, so the
             * same failure from a thousand browsers collapses to one row. Unique
             * because the recording path is an upsert: two reports arriving in
             * the same millisecond must not create two rows for one bug, and a
             * unique index gives that for free rather than through a lock — the
             * argument `payments.gateway_payment_id` already makes.
             */
            $table->string('fingerprint', 64)->unique();

            // site / admin / portal. Which boundary caught it, which is the
            // difference between a visitor seeing a broken page and a member of
            // staff being unable to work.
            $table->string('area', 16)->index();

            $table->text('message');

            /*
             * Next's server digest, where there is one.
             *
             * A production build replaces a server error's message with a hash,
             * so this is often the *only* way to match what the browser saw to
             * the stack trace in the server log. Without it a production report
             * says "an error occurred" and nothing more.
             */
            $table->string('digest', 64)->nullable();

            // The route it happened on, stored as a path: an origin here would
            // be a second answer to where this site lives.
            $table->string('path', 512)->nullable();

            $table->string('user_agent', 512)->nullable();

            $table->unsignedInteger('occurrences')->default(1);
            $table->timestamp('first_seen_at')->nullable();
            $table->timestamp('last_seen_at')->nullable()->index();

            /*
             * Marked dealt with rather than deleted.
             *
             * Deleting is how a bug quietly comes back and looks new. Resolved
             * rows stay, drop off the default list, and re-open by themselves:
             * the recording path clears this whenever a fingerprint is seen
             * again, so a fix that did not hold says so without anybody asking.
             */
            $table->timestamp('resolved_at')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('client_errors');
    }
};
