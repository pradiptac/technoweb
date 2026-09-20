<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Programmatic landing pages, and the places they can be about.
 *
 * The premise is that a database already knows which combinations are worth a
 * page — Cisco genuinely has eleven switches, so a page about Cisco switches
 * has something to say — and the danger is that the same database will just as
 * happily produce the six hundred combinations that do not. Those are doorway
 * pages, which Google names explicitly, and a site that ships them loses
 * ranking on the pages that were fine.
 *
 * So the schema is built around evidence rather than around the grid:
 *
 * **`path` is the identity, not a slug pair.** One unique column holding the
 * whole public path, so the frontend resolves a landing page with a single
 * lookup instead of trying a category endpoint and then a solution endpoint
 * the way `/products/[slug]` has to. That resolution order is a known cost in
 * this project and this is deliberately not a second instance of it. It also
 * means a page can be re-pointed at a different pair without changing its URL,
 * and that renaming any component slug is one recomputation.
 *
 * **`evidence` records what was true when the page was proposed** — the
 * product count behind it, the categories it covers. Kept as a column because
 * "why does this page exist" is a question asked months later, by which time
 * the catalogue has moved and the answer cannot be recomputed.
 *
 * **`intro` is separate from `body` and is the thing the gate measures.** A
 * generated page arrives with no intro at all, so it cannot publish until
 * somebody writes one — and `App\Support\LandingPageQuality` refuses two intros
 * that are near-duplicates of each other, which is what stops the whole
 * template-with-the-city-swapped pattern.
 *
 * **`auto_generated` is kept after creation** so the console can tell a page
 * the generator proposed from one a person decided to write. They are held to
 * the same bar; only the provenance differs.
 */
return new class extends Migration
{
    public function up(): void
    {
        /*
         * Places the company actually works in.
         *
         * Nothing is seeded here on purpose. A location row is a claim that
         * engineers attend sites in that city, and inventing them would be
         * both the doorway pattern and a false statement about the business —
         * the same reasoning that has the invented Mumbai address on the
         * must-not-ship list. The client enters the real ones.
         */
        Schema::create('locations', function (Blueprint $table) {
            $table->id();
            $table->string('name');                        // Kolkata
            $table->string('slug')->unique();              // kolkata
            $table->string('state')->nullable();           // West Bengal
            $table->string('country')->default('India');

            /*
             * The local substance a page needs before it may claim to serve a
             * place. All optional as columns and none of them optional in the
             * gate: `LandingPageQuality` requires at least one, because a
             * location page carrying none of them is a template with a name
             * substituted into it.
             */
            $table->string('office_address')->nullable();
            $table->string('response_time')->nullable();   // "Same-day on-site, weekdays"
            $table->text('summary')->nullable();           // Written, not derived.
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('landing_pages', function (Blueprint $table) {
            $table->id();

            /*
             * Which shape of page this is. An enum rather than a lookup table,
             * the same call as ticket status and for the same reason: code
             * branches on it — each kind has its own evidence rule, its own
             * path shape and its own structured data — so a new row could not
             * introduce a new kind without code anyway.
             */
            $table->string('kind', 32);

            $table->foreignId('brand_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('product_category_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('solution_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('service_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('location_id')->nullable()->constrained()->nullOnDelete();

            // The URL. Unique because it is the identity; indexed because every
            // public request is a lookup on it.
            $table->string('path')->unique();

            $table->string('title');
            $table->string('heading');                     // The h1, free to differ.
            $table->text('intro')->nullable();             // Rich text. The differentiator.
            $table->longText('body')->nullable();          // Rich text, optional.

            $table->string('status', 16)->default('draft');
            $table->boolean('auto_generated')->default(false);
            $table->json('evidence')->nullable();
            $table->timestamp('published_at')->nullable();
            $table->timestamps();

            // "Everything published, newest first" and "does this pair already
            // have a page" are the two queries this table answers.
            $table->index(['status', 'published_at']);
            $table->index(['kind', 'brand_id', 'product_category_id']);
            $table->index(['kind', 'location_id', 'service_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('landing_pages');
        Schema::dropIfExists('locations');
    }
};
