<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * C2 (0.187.0, docs/notifications.md): the bell, team notes and presence.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff_notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('kind', 30);
            $table->string('line', 240);
            $table->string('path', 240)->nullable();
            $table->string('subject_type', 40)->nullable();
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('actor_name', 120)->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->index(['user_id', 'read_at']);
            $table->index(['user_id', 'created_at']);
        });

        Schema::create('record_notes', function (Blueprint $table) {
            $table->id();
            $table->string('subject_type', 40);
            $table->unsignedBigInteger('subject_id');
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('author_name', 120)->nullable();
            $table->text('body');
            $table->json('mentions')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->index(['subject_type', 'subject_id']);
        });

        Schema::create('edit_presence', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('subject_type', 40);
            $table->unsignedBigInteger('subject_id');
            $table->boolean('dirty')->default(false);
            $table->timestamp('opened_at')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->unique(['user_id', 'subject_type', 'subject_id']);
            $table->index(['subject_type', 'subject_id', 'last_seen_at']);
        });

        Schema::table('staff_preferences', function (Blueprint $table) {
            $table->boolean('notify_mentions')->default(true);
        });
    }

    public function down(): void
    {
        Schema::table('staff_preferences', fn (Blueprint $table) => $table->dropColumn('notify_mentions'));
        Schema::dropIfExists('edit_presence');
        Schema::dropIfExists('record_notes');
        Schema::dropIfExists('staff_notifications');
    }
};
