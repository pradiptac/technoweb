<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Online meetings, held on Google Meet (2026-09-29, `docs/meetings.md`).
 *
 * Unlike an engineer visit this *is* a booking: a customer (or the desk on
 * their behalf) picks a free slot, and a host — a staff member holding the
 * `meeting_host` role — is assigned in the same transaction, so a host can
 * never be double-booked.
 *
 * `blocked_from`/`blocked_until` are the meeting widened by its type's
 * buffers, written every time the row is saved. The overlap check reads
 * them, never the type's current buffers, so a later change to a type moves
 * no existing block.
 *
 * A reminder is claimed by inserting its row: the unique key on
 * `(meeting_id, offset_minutes, starts_at)` is the claim, and a reschedule
 * gives the meeting a new `starts_at`, so new rows are claimable without
 * deleting the old ones.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('meeting_types', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->string('slug', 140)->unique();
            $table->text('description')->nullable();
            $table->unsignedSmallInteger('minutes')->default(30);
            $table->unsignedSmallInteger('buffer_before')->default(0);
            $table->unsignedSmallInteger('buffer_after')->default(0);
            $table->boolean('is_public')->default(true);
            $table->boolean('is_active')->default(true);
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->index(['is_active', 'sort_order']);
        });

        // The hosts allowed for a type. None means every eligible host; a
        // non-empty list whose hosts are no longer eligible means none.
        Schema::create('meeting_type_user', function (Blueprint $table) {
            $table->foreignId('meeting_type_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            $table->primary(['meeting_type_id', 'user_id']);
        });

        // A host's weekly hours. Several rows for a day are allowed (a split
        // day); a host with no rows works the default hours in the settings.
        Schema::create('meeting_host_hours', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('weekday'); // ISO 1 (Monday) – 7 (Sunday)
            $table->time('start');
            $table->time('end');
            $table->timestamps();

            $table->index(['user_id', 'weekday']);
        });

        Schema::create('meeting_host_time_off', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->dateTime('starts_at');
            $table->dateTime('ends_at');
            $table->string('note', 255)->nullable();
            $table->timestamps();

            $table->index(['user_id', 'starts_at']);
        });

        Schema::create('meetings', function (Blueprint $table) {
            $table->id();
            $table->string('reference', 20)->unique();
            $table->foreignId('meeting_type_id')->constrained()->restrictOnDelete();

            // The host. Copied by name onto the row, so a deleted account
            // still reads as somebody in the history.
            $table->foreignId('host_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('host_name', 120)->nullable();

            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name', 120);
            $table->string('email', 190);
            $table->string('phone', 32)->nullable();
            $table->string('company', 160)->nullable();
            $table->text('agenda')->nullable();

            $table->dateTime('starts_at');
            $table->dateTime('ends_at');
            $table->dateTime('blocked_from');
            $table->dateTime('blocked_until');

            $table->string('status', 20)->default('scheduled');
            $table->string('cancel_reason', 500)->nullable();
            // Stamped on arrival and never cleared — the `resolved_at` rule.
            $table->dateTime('cancelled_at')->nullable();
            $table->dateTime('completed_at')->nullable();
            $table->unsignedSmallInteger('reschedule_count')->default(0);

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('source', 20)->default('site');

            // Google Calendar. The event id is chosen by us, so a retried
            // insert can never make two events.
            $table->string('google_event_id', 120)->nullable();
            $table->unsignedInteger('google_event_seq')->default(0);
            $table->string('google_calendar_id')->nullable();
            $table->string('google_account', 190)->nullable();
            $table->string('meet_url', 255)->nullable();
            $table->string('google_status', 20)->default('pending');
            $table->unsignedSmallInteger('google_attempts')->default(0);
            $table->text('google_error')->nullable();

            $table->string('access_token', 64);
            $table->text('staff_note')->nullable();
            $table->foreignId('lead_id')->nullable()->constrained()->nullOnDelete();

            $table->string('source_url', 2048)->nullable();
            $table->string('source_path')->nullable();
            $table->string('source_title')->nullable();
            $table->string('referrer', 2048)->nullable();
            $table->string('utm_source')->nullable();
            $table->string('utm_medium')->nullable();
            $table->string('utm_campaign')->nullable();
            $table->string('ip_address', 45)->nullable();

            $table->timestamps();

            // The overlap check (a host's blocks from a time) and the diary.
            $table->index(['host_id', 'blocked_from']);
            $table->index(['status', 'starts_at']);
            $table->index(['google_status', 'google_attempts']);
            $table->index('email');
        });

        Schema::create('meeting_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('meeting_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type', 40);
            $table->string('from_value')->nullable();
            $table->string('to_value')->nullable();
            $table->text('note')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index(['meeting_id', 'created_at']);
        });

        Schema::create('meeting_reminders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('meeting_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('offset_minutes');
            $table->dateTime('starts_at');
            $table->dateTime('sent_at')->nullable();
            $table->timestamps();

            $table->unique(['meeting_id', 'offset_minutes', 'starts_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('meeting_reminders');
        Schema::dropIfExists('meeting_events');
        Schema::dropIfExists('meetings');
        Schema::dropIfExists('meeting_host_time_off');
        Schema::dropIfExists('meeting_host_hours');
        Schema::dropIfExists('meeting_type_user');
        Schema::dropIfExists('meeting_types');
    }
};
