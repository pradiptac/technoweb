<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Who did what, on the things where that question gets asked.
 *
 * `ticket_events` already answers it for tickets. This answers it for the rest
 * of the console: who deleted the product, who changed the SMTP password, who
 * approved the customer, who demoted a colleague.
 *
 * The actor and the subject are **denormalised on purpose**. Staff accounts can
 * be deleted and records can be destroyed, and a log that forgets who did
 * something the moment they leave — or what the thing was called — has failed
 * at exactly the point somebody is reading it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('activity_log', function (Blueprint $table) {
            $table->id();

            // Kept for joins while the account exists; the strings below are
            // what survives it.
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('actor_name');
            $table->string('actor_email');

            // The route's own last segment: store, update, destroy, approve,
            // reject, clear-secret. The routes already name themselves, so
            // nothing has to be invented per call site.
            $table->string('action', 40);

            // Morph key, not a class name — App\Providers\AppServiceProvider
            // enforces the map.
            $table->string('subject_type', 40)->nullable();
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->string('subject_label')->nullable();

            // Redacted by an allowlist before it reaches here. Never a request
            // body wholesale: that would be a plaintext copy of every
            // credential the settings form has ever carried.
            $table->json('context')->nullable();

            $table->string('ip', 45)->nullable();
            $table->string('user_agent', 255)->nullable();

            $table->timestamp('created_at')->useCurrent();

            $table->index('created_at');
            $table->index(['user_id', 'created_at']);
            $table->index(['subject_type', 'subject_id']);
            $table->index(['action', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('activity_log');
    }
};
