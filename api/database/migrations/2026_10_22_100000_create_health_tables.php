<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** The site health centre (0.181.0, docs/health.md). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('health_findings', function (Blueprint $table) {
            $table->id();
            $table->string('subject_type', 40);
            $table->unsignedBigInteger('subject_id');
            // Whether the record was published when checked: the score counts published records only.
            $table->boolean('subject_published')->default(false);
            $table->string('check', 40);
            $table->string('severity', 10);
            $table->string('field', 120);
            $table->json('detail')->nullable();
            $table->char('fingerprint', 40)->unique();
            $table->timestamp('first_seen_at');
            $table->timestamp('last_seen_at');
            $table->timestamp('ignored_at')->nullable();
            $table->foreignId('ignored_by')->nullable()->constrained('users')->nullOnDelete();
            $table->index(['subject_type', 'subject_id']);
            $table->index(['severity', 'ignored_at']);
        });

        Schema::create('health_links', function (Blueprint $table) {
            $table->id();
            $table->char('url_hash', 40)->unique();
            $table->text('url');
            $table->string('host', 255);
            $table->boolean('internal')->default(false);
            $table->unsignedSmallInteger('status')->nullable();
            $table->string('result', 10)->default('pending');
            $table->unsignedTinyInteger('fails')->default(0);
            $table->timestamp('checked_at')->nullable();
            $table->timestamp('next_check_at')->nullable()->index();
            $table->timestamps();
        });

        Schema::create('health_link_refs', function (Blueprint $table) {
            $table->foreignId('health_link_id')->constrained('health_links')->cascadeOnDelete();
            $table->string('subject_type', 40);
            $table->unsignedBigInteger('subject_id');
            $table->unique(['health_link_id', 'subject_type', 'subject_id'], 'health_link_refs_unique');
            $table->index(['subject_type', 'subject_id']);
        });

        Schema::create('health_snapshots', function (Blueprint $table) {
            $table->id();
            $table->date('date')->unique();
            $table->unsignedTinyInteger('score')->nullable();
            $table->unsignedInteger('records_checked')->default(0);
            $table->json('counts');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('health_snapshots');
        Schema::dropIfExists('health_link_refs');
        Schema::dropIfExists('health_links');
        Schema::dropIfExists('health_findings');
    }
};
