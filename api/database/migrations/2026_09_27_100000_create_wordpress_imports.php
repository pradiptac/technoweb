<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Imports from a WordPress (and WooCommerce) site, and the map of what each
 * one wrote.
 *
 * `wordpress_imports` is one run: scanned across queued slices into a
 * harvest on the private disk, reviewed, then committed across more slices.
 * `status` is `pending → scanning → ready → running → completed`, with
 * `failed`, `cancelled` and `expired` the ways out — the newsletter mailbox
 * scan's lifecycle, for the same reasons. `sections` is what was asked for,
 * `decisions` what the review settled, `analysis` the dry run's answer,
 * `counts` and `problems` the commit's.
 *
 * `wordpress_import_map` is what makes a second run of the same site an
 * update rather than a copy, and what the link rewriter and the redirect
 * writer read: one row per source record per site, pointing at the record
 * it became (a morph alias and an id, never a class name — the morph map is
 * enforced). `site` is a hash of the site's origin, so two sites' post 42 are
 * two rows. `source_url` is where the record lived there — the permalink for
 * a post, the file URL for an attachment — and is what a 301 is written
 * from. Deliberately not a foreign key on the target: a record deleted here
 * afterwards leaves a row that the next run notices and re-creates rather
 * than a cascade nobody asked for.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wordpress_imports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('site_url', 255);
            $table->char('site', 40)->index();
            $table->string('status', 20)->default('pending');
            $table->json('sections')->nullable();
            $table->json('decisions')->nullable();
            $table->json('progress')->nullable();
            $table->json('analysis')->nullable();
            $table->json('counts')->nullable();
            $table->json('problems')->nullable();
            $table->string('error', 500)->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'updated_at']);
        });

        Schema::create('wordpress_import_map', function (Blueprint $table) {
            $table->id();
            $table->char('site', 40);
            $table->string('source_type', 40);
            $table->string('source_id', 64);
            $table->string('target_type', 60);
            $table->unsignedBigInteger('target_id');
            $table->string('source_url', 2000)->nullable();
            $table->foreignId('wordpress_import_id')->nullable()->constrained('wordpress_imports')->nullOnDelete();
            $table->timestamps();

            $table->unique(['site', 'source_type', 'source_id']);
            $table->index(['target_type', 'target_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wordpress_import_map');
        Schema::dropIfExists('wordpress_imports');
    }
};
