<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The satisfaction survey sent when a support ticket is closed (2026-09-30).
 *
 * One row per ticket, ever: `ticket_id` is unique, which is what makes "asked
 * once" the index rather than a check — a ticket that is reopened and closed
 * again is not asked a second time. The row is written before the email goes,
 * so a send that fails still leaves the ticket marked as asked.
 *
 * `token` is the secret in the link the customer is emailed. It is what stands
 * in for a login, so it is 64 hex characters from `random_bytes`, unique, and
 * never appears in any resource. `rating` is 1–5 (`SurveyRating`), null until
 * answered; `answered_at` is stamped by the first answer and never moved, so a
 * customer changing their mind updates the row and keeps the moment they first
 * answered.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ticket_surveys', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ticket_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('token', 64)->unique();
            $table->timestamp('sent_at');
            $table->unsignedTinyInteger('rating')->nullable();
            $table->text('comment')->nullable();
            $table->timestamp('answered_at')->nullable();
            $table->timestamps();

            // The dashboard's satisfaction figure ranges on when it was answered.
            $table->index('answered_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ticket_surveys');
    }
};
