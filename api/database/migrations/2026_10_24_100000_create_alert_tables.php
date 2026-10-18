<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Digest and alerts (0.185.0, docs/digest-alerts.md).
 *
 * `alert_fires` keeps one row per (rule, subject, person) for good: firing
 * stamps `fired_at` and clears `cleared_at`, clearing stamps `cleared_at`.
 * MySQL has no partial unique index, so "one open fire" is one row that is
 * re-armed rather than a new row each time.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff_preferences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('digest', 10)->default('weekly');
            $table->unsignedTinyInteger('digest_hour')->default(8);
            $table->unsignedTinyInteger('digest_weekday')->default(1);
            $table->boolean('digest_skip_quiet')->default(false);
            $table->json('alerts')->nullable();
            $table->boolean('alert_email')->default(true);
            $table->boolean('alert_push')->default(true);
            $table->string('quiet_start', 5)->default('21:00');
            $table->string('quiet_end', 5)->default('08:00');
            $table->timestamp('last_digest_at')->nullable();
            $table->json('last_digest_figures')->nullable();
            $table->timestamps();
        });

        Schema::create('alert_fires', function (Blueprint $table) {
            $table->id();
            $table->string('rule', 40);
            $table->string('subject', 80);
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('fired_at');
            $table->timestamp('cleared_at')->nullable();
            $table->unique(['rule', 'subject', 'user_id']);
            $table->index(['rule', 'cleared_at']);
        });

        Schema::create('staff_push_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('token', 512)->unique();
            $table->string('label', 80)->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamp('failed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff_push_subscriptions');
        Schema::dropIfExists('alert_fires');
        Schema::dropIfExists('staff_preferences');
    }
};
