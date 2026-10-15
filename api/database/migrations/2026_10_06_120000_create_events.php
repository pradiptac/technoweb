<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Events (0.118.0, `docs/events.md`): something with a date that people
 * attend, and — optionally — a free registration with a capacity and a
 * waiting list.
 *
 * `speakers` and `agenda` are JSON **lists** of small objects, in the
 * editor's order: a JSON array keeps its order, and the order is content.
 * Nothing here is recurring — each date is its own row, and the console
 * duplicates one.
 *
 * No `published_at`: an event's date is `starts_at`, and status alone
 * decides whether it is public (the case study's rule).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('events', function (Blueprint $table) {
            $table->id();
            $table->string('title', 160);
            $table->string('slug', 180)->unique();
            $table->string('summary', 300)->nullable();
            $table->longText('body')->nullable();
            $table->string('status', 20)->default('draft');
            $table->boolean('is_featured')->default(false);

            $table->string('format', 20)->default('in_person');
            $table->dateTime('starts_at');
            $table->dateTime('ends_at')->nullable();

            $table->string('venue_name', 160)->nullable();
            $table->string('venue_city', 80)->nullable();
            $table->string('venue_address', 500)->nullable();
            $table->string('map_url', 500)->nullable();
            // The join link. On no public read: it goes to people who registered.
            $table->string('online_url', 500)->nullable();

            $table->string('cover_image_path')->nullable();
            $table->json('speakers')->nullable();
            $table->json('agenda')->nullable();

            $table->string('registration_mode', 20)->default('none');
            $table->string('external_url', 500)->nullable();
            // Seats, not registrations: one registration may be a party.
            $table->unsignedInteger('capacity')->nullable();
            $table->boolean('waitlist_enabled')->default(false);
            $table->unsignedTinyInteger('max_seats')->default(5);
            $table->dateTime('registration_closes_at')->nullable();

            $table->timestamps();

            // The two public lists (upcoming, past) and the admin's default
            // order all range on the start within a status.
            $table->index(['status', 'starts_at']);
        });

        Schema::create('event_registrations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();

            $table->string('name', 120);
            $table->string('email', 190);
            $table->string('phone', 30)->nullable();
            $table->string('company', 160)->nullable();
            $table->unsignedSmallInteger('seats')->default(1);
            $table->text('note')->nullable();
            $table->text('staff_note')->nullable();

            $table->string('status', 20)->default('confirmed');
            // `public` or `staff` — which door it came through.
            $table->string('source', 10)->default('public');

            // What the manage link carries. Sent only in the emails to the
            // address that registered; in no response and no resource.
            $table->char('token', 64)->unique();
            $table->foreignId('lead_id')->nullable()->constrained()->nullOnDelete();

            // The waiting list's order: when this registration joined it,
            // which is not `created_at` for one that was cancelled and revived.
            $table->dateTime('waitlisted_at')->nullable();
            $table->dateTime('reminded_at')->nullable();
            $table->dateTime('cancelled_at')->nullable();

            $table->string('source_url', 2048)->nullable();
            $table->string('source_path')->nullable();
            $table->string('source_title')->nullable();
            $table->string('referrer', 2048)->nullable();
            $table->string('utm_source')->nullable();
            $table->string('utm_medium')->nullable();
            $table->string('utm_campaign')->nullable();
            $table->string('ip_address', 45)->nullable();

            $table->timestamps();

            // One registration per address per event: a repeat is the same
            // row, never a second one — and the index is what guarantees it
            // when two submissions race.
            $table->unique(['event_id', 'email']);
            // The counts (seats by status) and the promotion walk.
            $table->index(['event_id', 'status', 'waitlisted_at']);
            // The reminder's read: confirmed and not yet reminded.
            $table->index(['status', 'reminded_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('event_registrations');
        Schema::dropIfExists('events');
    }
};
