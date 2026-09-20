<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Vacancies, and the people who apply to them.
 *
 * **The table is `job_openings`, not `jobs`.** Laravel owns `jobs` — it is the
 * database queue's table, shipped by `0001_01_01_000002_create_jobs_table.php`
 * and in real use here, since `QUEUE_CONNECTION=database`. Naming a vacancies
 * table `jobs` collides with it, which is exactly how the first run of this
 * migration failed.
 *
 * Qualifications and experience levels are **lookup tables, not enums** — the
 * opposite call from ticket status, and for the reason that decision gives:
 * a ticket status is a fixed lifecycle application code branches on, while
 * "B.E. Computer Science" is a value the client adds to. Nothing in the code
 * needs to know a qualification exists.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('job_experience_levels', function (Blueprint $table) {
            $table->id();
            $table->string('name');                       // Fresher, 2-4 years, Senior
            $table->unsignedSmallInteger('min_years')->default(0);
            $table->unsignedSmallInteger('max_years')->nullable();  // null = "and above"
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('job_qualifications', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('job_openings', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->string('slug')->unique();
            $table->string('department')->nullable();
            $table->string('location')->nullable();
            $table->string('employment_type', 30)->default('full_time');
            $table->unsignedSmallInteger('openings')->default(1);

            $table->foreignId('job_experience_level_id')->nullable()
                ->constrained('job_experience_levels')->nullOnDelete();

            /*
             * Optional, and shown only when filled.
             *
             * Google Jobs indexes a posting better with a salary on it, but a
             * firm that will not publish a senior band should not be forced to
             * invent one — so the field exists and the frontend omits the whole
             * block when it is empty, rather than printing "Salary: —".
             */
            $table->unsignedInteger('salary_min')->nullable();
            $table->unsignedInteger('salary_max')->nullable();
            $table->string('salary_period', 20)->default('year');
            $table->string('salary_currency', 3)->default('INR');

            $table->string('summary', 500)->nullable();
            $table->longText('description')->nullable();      // rich text, sanitised on write
            $table->json('responsibilities')->nullable();
            $table->json('requirements')->nullable();

            $table->string('status', 20)->default('draft');   // draft / published / archived
            $table->timestamp('published_at')->nullable();

            // After this, the posting stops accepting applications on its own.
            // A vacancy nobody remembered to close is the usual way a careers
            // page starts lying.
            $table->date('closes_at')->nullable();

            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['status', 'published_at']);
            $table->index('department');
        });

        Schema::create('job_opening_job_qualification', function (Blueprint $table) {
            $table->foreignId('job_opening_id')->constrained('job_openings')->cascadeOnDelete();
            $table->foreignId('job_qualification_id')->constrained()->cascadeOnDelete();
            $table->primary(['job_opening_id', 'job_qualification_id']);
        });

        Schema::create('job_applications', function (Blueprint $table) {
            $table->id();

            /*
             * Kept when the vacancy is deleted, with the title copied beside
             * it — the same rule `form_submissions` follows. An application is
             * a record of something a person actually sent, and closing a role
             * must not destroy the record of who applied to it.
             */
            $table->foreignId('job_opening_id')->nullable()->constrained('job_openings')->nullOnDelete();
            $table->string('job_title');

            $table->string('name');
            $table->string('email');
            $table->string('phone', 32)->nullable();
            $table->string('current_company')->nullable();
            $table->unsignedSmallInteger('experience_years')->nullable();
            $table->text('cover_letter')->nullable();
            $table->string('portfolio_url')->nullable();

            /*
             * The CV lives on the **private** disk and is streamed through an
             * authorised controller — never a public URL, exactly like a ticket
             * attachment. This is an unauthenticated upload from the open
             * internet; a public path here would be file hosting for anyone who
             * finds the form.
             */
            $table->string('cv_disk', 20)->nullable();
            $table->string('cv_path')->nullable();
            $table->string('cv_filename')->nullable();
            $table->string('cv_mime', 100)->nullable();
            $table->unsignedInteger('cv_size')->nullable();

            $table->string('status', 20)->default('new');
            $table->text('status_note')->nullable();          // staff-only
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();

            $table->string('ip_address', 45)->nullable();
            $table->timestamps();

            $table->index(['job_opening_id', 'created_at']);
            $table->index(['status', 'created_at']);
            $table->index('created_at');                      // the retention prune reads this
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('job_applications');
        Schema::dropIfExists('job_opening_job_qualification');
        Schema::dropIfExists('job_openings');
        Schema::dropIfExists('job_qualifications');
        Schema::dropIfExists('job_experience_levels');
    }
};
