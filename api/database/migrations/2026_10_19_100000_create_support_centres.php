<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The service support network (0.170.0, docs/support-network.md): offices and
 * service centres with an address, a phone and a pin on the map, and the
 * staff who work at each.
 *
 * Not the `locations` tree: a location is an SEO place (a claim that work is
 * done there, backing landing pages); a centre is a building with a phone.
 * `location_id` links the two when an editor wants to.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('support_centres', function (Blueprint $table) {
            $table->id();
            $table->string('name', 160);
            $table->string('slug', 180)->unique();
            $table->string('kind', 24)->default('service_centre');
            $table->char('country_code', 2);
            $table->string('region', 120)->nullable();
            $table->string('city', 120);
            $table->text('address')->nullable();
            $table->string('phone', 40)->nullable();
            $table->string('phone_alt', 40)->nullable();
            $table->string('email', 191)->nullable();
            $table->string('hours', 255)->nullable();
            $table->decimal('latitude', 9, 6)->nullable();
            $table->decimal('longitude', 9, 6)->nullable();
            $table->foreignId('location_id')->nullable()->constrained('locations')->nullOnDelete();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['is_active', 'country_code', 'city']);
        });

        Schema::create('support_centre_user', function (Blueprint $table) {
            $table->id();
            $table->foreignId('support_centre_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('title', 80)->nullable();
            $table->boolean('is_public')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['support_centre_id', 'user_id']);
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('support_centre_user');
        Schema::dropIfExists('support_centres');
    }
};
