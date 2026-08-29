<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Two fields the library needs and `alt_text` cannot be asked to do.
 *
 * **They are not the same thing, and conflating them is an accessibility bug
 * rather than a tidy simplification.** Alt text is what a screen reader
 * announces *in place of* the image, so it is short, factual, and read aloud
 * on every page that renders the picture. A description is a note about the
 * asset for whoever is working in the library — where the shot was taken, what
 * the licence is, which campaign it belongs to — and belongs on no public page
 * at all. One field doing both means either alt text nobody can search or a
 * paragraph read out to a screen-reader user who asked what the picture shows.
 *
 * `tags` is JSON rather than a pivot table, deliberately. These are free
 * labels an editor invents while filing — "hero", "2026-brochure", "needs
 * reshoot" — not a taxonomy anything branches on, and the project's existing
 * line is drawn exactly there: `TicketStatus` is an enum because code branches
 * on it, `job_qualifications` is a table because it is a value the client adds
 * to and other records point at. Nothing points at a media tag.
 *
 * Note the ordering caveat this project has already been bitten by: MySQL's
 * JSON type normalises *object* keys by length then alphabetically. This is a
 * JSON **array**, and arrays are order-preserving, so the tags come back in
 * the order they were entered. Anything key-shaped and order-sensitive needs
 * `App\Casts\SpecSheet` instead.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('media', function (Blueprint $table) {
            $table->text('description')->nullable()->after('alt_text');
            $table->json('tags')->nullable()->after('description');
        });
    }

    public function down(): void
    {
        Schema::table('media', function (Blueprint $table) {
            $table->dropColumn(['description', 'tags']);
        });
    }
};
