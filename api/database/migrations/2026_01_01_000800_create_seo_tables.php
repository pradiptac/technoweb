<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        /*
         * One polymorphic SEO record per entity. Every field is nullable on
         * purpose: the application generates sensible defaults and this table
         * only stores deliberate overrides. An empty row means "use the
         * automatic value", not "this page has no SEO".
         */
        Schema::create('seo_metadata', function (Blueprint $table) {
            $table->id();
            $table->morphs('seoable');
            $table->string('title')->nullable();
            $table->string('description', 320)->nullable();
            $table->string('canonical_url')->nullable();
            $table->string('robots', 60)->nullable();          // index,follow / noindex,nofollow
            $table->string('focus_keyword')->nullable();
            $table->string('og_title')->nullable();
            $table->string('og_description', 320)->nullable();
            $table->string('og_image_path')->nullable();
            $table->string('schema_type', 40)->nullable();     // Product, Service, Article …
            $table->boolean('sitemap_include')->default(true);
            $table->decimal('sitemap_priority', 2, 1)->default(0.5);
            $table->string('sitemap_changefreq', 20)->nullable();
            // Cached output of the SEO health check, recomputed on save.
            $table->unsignedTinyInteger('health_score')->nullable();
            $table->json('health_report')->nullable();
            $table->timestamps();

            $table->unique(['seoable_type', 'seoable_id']);
        });

        Schema::create('redirects', function (Blueprint $table) {
            $table->id();
            $table->string('from_path')->unique();
            $table->string('to_path');
            $table->unsignedSmallInteger('status_code')->default(301);
            $table->boolean('is_active')->default(true);
            // Set automatically when a slug changes, so old URLs keep working.
            $table->boolean('created_automatically')->default(false);
            $table->unsignedInteger('hit_count')->default(0);
            $table->timestamp('last_hit_at')->nullable();
            $table->timestamps();
        });

        Schema::create('settings', function (Blueprint $table) {
            $table->id();
            $table->string('group', 40)->default('general');
            $table->string('key')->unique();
            $table->longText('value')->nullable();
            $table->string('type', 20)->default('string');  // string, text, json, boolean
            $table->timestamps();

            $table->index('group');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('settings');
        Schema::dropIfExists('redirects');
        Schema::dropIfExists('seo_metadata');
    }
};
