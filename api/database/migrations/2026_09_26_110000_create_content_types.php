<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Custom content types and their entries (docs/custom-content.md).
 *
 * A type is a kind of record an editor made — "Events", "Downloads",
 * "Partners" — and its `slug` is the URL prefix every entry lives under:
 * `/events` is the archive, `/events/{entry-slug}` an entry. The slug is
 * checked against every route the site already owns (`ReservedSlugs`) and
 * every CMS page, because the two share the one top-level segment.
 *
 * Entries share one table and are told apart by their type; a slug is unique
 * **per type**, so `/events/launch` and `/downloads/launch` can both exist.
 * `content_type_id` restricts deletion: a type with entries is refused, which
 * the console says, rather than taking a year of content with it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('content_types', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);
            $table->string('plural', 100);
            $table->string('slug', 60)->unique();
            $table->string('icon', 60)->nullable();
            $table->text('description')->nullable();
            $table->boolean('has_body')->default(true);
            $table->boolean('has_image')->default(true);
            $table->boolean('archive_enabled')->default(true);
            $table->unsignedSmallInteger('per_page')->default(12);
            // `newest`, `title` or `manual` — how the archive orders entries.
            $table->string('sort', 20)->default('newest');
            // What an entry says it is in JSON-LD: `Article` or `WebPage`.
            $table->string('schema_type', 30)->default('Article');
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('content_type_id')->constrained()->restrictOnDelete();
            $table->string('title');
            $table->string('slug');
            $table->text('summary')->nullable();
            $table->longText('body')->nullable();
            $table->string('image_path')->nullable();
            $table->string('status', 20)->default('draft');
            $table->timestamp('published_at')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            // Unique per type — and the left prefix the archive reads by.
            $table->unique(['content_type_id', 'slug']);
            // The archive's published listing, newest first.
            $table->index(['content_type_id', 'status', 'published_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('entries');
        Schema::dropIfExists('content_types');
    }
};
