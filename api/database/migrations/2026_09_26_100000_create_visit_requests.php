<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Engineer visit requests (2026-09-26, `docs/visits.md`).
 *
 * A customer offers up to three preferred dates, each with a part of the day,
 * and the desk picks the actual appointment. There is no availability
 * calendar: `preferred` is what was asked for and `scheduled_*` is what was
 * agreed, and the two are separate columns because they are separate
 * answers from separate people.
 *
 * `preferred` is a JSON **list** of `{date, window}`, never a map keyed by
 * date — MySQL reorders object keys, the reason `App\Casts\SpecSheet` exists,
 * and the order somebody ranked their choices in is content.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('visit_requests', function (Blueprint $table) {
            $table->id();
            $table->string('reference', 20)->unique();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();

            $table->string('name', 120);
            $table->string('email', 190);
            $table->string('phone', 32);
            $table->string('company', 160)->nullable();
            $table->json('site_address');

            $table->foreignId('service_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('solution_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('location_id')->nullable()->constrained()->nullOnDelete();

            $table->text('notes')->nullable();
            $table->json('preferred');

            $table->string('status', 20)->default('requested');
            $table->dateTime('scheduled_start_at')->nullable();
            $table->dateTime('scheduled_end_at')->nullable();
            $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $table->text('staff_note')->nullable();
            $table->string('cancel_reason', 500)->nullable();

            // Stamped on arrival and never cleared — the `resolved_at` rule.
            $table->dateTime('confirmed_at')->nullable();
            $table->dateTime('completed_at')->nullable();
            $table->dateTime('cancelled_at')->nullable();
            $table->dateTime('reminded_at')->nullable();

            $table->string('access_token', 64);
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

            // The queue's two ordinary reads: what is waiting, and the diary.
            $table->index(['status', 'created_at']);
            $table->index(['status', 'scheduled_start_at']);
        });

        Schema::create('visit_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('visit_request_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type', 40);
            $table->string('from_value')->nullable();
            $table->string('to_value')->nullable();
            $table->text('note')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index(['visit_request_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('visit_events');
        Schema::dropIfExists('visit_requests');
    }
};
