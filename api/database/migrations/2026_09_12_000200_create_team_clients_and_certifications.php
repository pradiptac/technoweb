<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * The company profile: who works here, who it works for, and what it is
 * certified to do. Three index-page entities and one child table.
 *
 * None of them carries a slug. There are no detail pages — `/team`,
 * `/clients` and `/certifications` are lists — so a slug would be an
 * identifier nothing looks up, and `Sluggable` would write 301s between URLs
 * that have never existed. `Popup` and `Slider` record the same reasoning.
 *
 * An engineer's certifications are a child table replaced wholesale on
 * save, like `slides`, rather than a pivot to the company certifications: a
 * person's CCNA carries that person's expiry and credential id, and does not
 * belong in the list of things the *company* holds.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('certifications', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150);
            $table->string('issuer', 150)->nullable();
            $table->string('certificate_number', 100)->nullable();
            // The badge or logo, and the certificate itself as a PDF — both
            // media-library paths on the public disk. A certificate is public
            // by nature; that is what it is for.
            $table->string('image_path')->nullable();
            $table->string('file_path')->nullable();
            $table->date('issued_on')->nullable();
            $table->date('valid_until')->nullable();
            $table->text('description')->nullable();
            $table->string('status', 20)->default('draft')->index();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['status', 'sort_order']);
        });

        Schema::create('clients', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150);
            $table->string('logo_path')->nullable();
            $table->string('website_url', 2048)->nullable();
            // The taxonomy that already exists, not a free-text sector that
            // drifts into "Health care" and "Healthcare" — the call
            // `case_studies.industry_id` already makes.
            $table->foreignId('industry_id')->nullable()->constrained()->nullOnDelete();
            $table->string('note', 200)->nullable();
            $table->boolean('is_featured')->default(false);
            $table->string('status', 20)->default('draft')->index();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['status', 'is_featured', 'sort_order']);
        });

        Schema::create('team_members', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->string('designation', 120)->nullable();
            // Free text, offered back through a datalist of the values in
            // use. A table of departments would be its own CRUD for what is,
            // on a company this size, four strings.
            $table->string('department', 80)->nullable()->index();
            $table->string('photo_path')->nullable();
            $table->text('bio')->nullable();
            // Both optional and both public when filled. There is deliberately
            // no phone column: the site has one public number, and a personal
            // one on a public API is either leaked or unused.
            $table->string('email')->nullable();
            $table->string('linkedin_url')->nullable();
            $table->string('status', 20)->default('draft')->index();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['status', 'sort_order']);
        });

        Schema::create('team_member_certifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('team_member_id')->constrained()->cascadeOnDelete();
            $table->string('name', 150);
            $table->string('issuer', 150)->nullable();
            $table->string('credential_id', 100)->nullable();
            $table->date('issued_on')->nullable();
            $table->date('expires_on')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['team_member_id', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('team_member_certifications');
        Schema::dropIfExists('team_members');
        Schema::dropIfExists('clients');
        Schema::dropIfExists('certifications');
    }
};
