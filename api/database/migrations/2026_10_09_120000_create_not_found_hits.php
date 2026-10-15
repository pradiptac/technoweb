<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Addresses visitors asked for that do not exist (0.137.0, "Missing pages").
 *
 * A redirect is only ever written for a slug this CMS itself changed, so a page
 * that moved before the site existed, a mistyped link in a printed brochure and
 * an old address another website still points at all 404 in silence — the one
 * kind of lost ranking nothing in the console could show. This is the list that
 * shows it: an address, how often it was asked for, and where the last visitor
 * came from, so an SEO manager can turn one into a redirect in a press.
 *
 * **One row per distinct address, not per request** — the shape `client_errors`
 * has, for the same reason: a crawler hammering one dead URL is one row with a
 * count, and the table's size is bounded by the number of distinct dead
 * addresses, a number a person could read.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('not_found_hits', function (Blueprint $table) {
            $table->id();

            $table->string('path', 512);

            /*
             * The identity of an address, and what makes the recording path an
             * upsert. A 512-character `path` cannot carry a unique index on
             * utf8mb4 (the key limit is 3072 bytes), and a hash gives the same
             * guarantee without a lock: two reports of one address in the same
             * millisecond cannot create two rows.
             */
            $table->char('path_hash', 64)->unique();

            $table->unsignedInteger('hits')->default(1);

            // The last page that linked here, origin and path only — a query
            // string on a referrer is somebody else's session.
            $table->string('referrer', 512)->nullable();

            $table->timestamp('first_seen_at')->nullable();
            $table->timestamp('last_seen_at')->nullable()->index();

            /*
             * "Not worth a redirect" — a scanner's guess, a typo nobody linked.
             * Kept rather than deleted: deleting would let the same address
             * climb straight back onto the list on its next request.
             */
            $table->timestamp('ignored_at')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('not_found_hits');
    }
};
