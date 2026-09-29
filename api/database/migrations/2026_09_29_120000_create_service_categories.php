<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Service categories, and a picture per service (2026-09-29).
 *
 * A category is taxonomy, like a product category: no publish status, no
 * public page of its own and no SEO — it groups the services into the tabs
 * the Services section draws. `image_background` is the one switch that is
 * about drawing rather than grouping: the services under it show their
 * picture as the card's ground.
 *
 * `services.service_category_id` is `nullOnDelete`, so deleting a category
 * leaves its services uncategorised rather than taking them with it.
 * `image_path` is a plain media-library path, resolved to a URL in the
 * resource layer — the shape of a product category's `image_path`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_categories', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->text('description')->nullable();
            $table->string('icon', 40)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('image_background')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::table('services', function (Blueprint $table) {
            $table->foreignId('service_category_id')->nullable()->after('id')
                ->constrained('service_categories')->nullOnDelete();
            $table->string('image_path')->nullable()->after('icon');
        });
    }

    public function down(): void
    {
        Schema::table('services', function (Blueprint $table) {
            $table->dropConstrainedForeignId('service_category_id');
            $table->dropColumn('image_path');
        });

        Schema::dropIfExists('service_categories');
    }
};
