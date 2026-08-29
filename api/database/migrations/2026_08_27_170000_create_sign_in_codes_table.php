<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One-time sign-in codes, for both principals.
 *
 * **Keyed by address *and* audience, never by a user id.** Two reasons, both
 * of which have already cost this project a bug:
 *
 * `Customer` and `User` ids collide on a seeded install — the administrator
 * and the first customer were both id 1 — which is why
 * `EnsureUserIsCustomer` exists at all.
 *
 * And both password brokers once shared `password_reset_tokens`, whose primary
 * key is the email address, so a token issued to a *customer* reset the
 * *staff* account at the same address: privilege escalation into the admin
 * console, from a table that read as perfectly ordinary. A code is exactly the
 * same shape of secret, so `audience` is part of every lookup rather than
 * something checked afterwards.
 *
 * A row is written for addresses with no account behind them too. Nothing is
 * sent for those, but the work done has to look the same from outside or the
 * endpoint becomes the membership oracle that `/auth/register` goes out of its
 * way not to be.
 *
 * `code_hash` and not `code`: a database read must not yield a working code,
 * the same rule `email_verification_token` and the reset tokens follow.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sign_in_codes', function (Blueprint $table) {
            $table->id();
            $table->string('audience', 16);
            $table->string('email');
            $table->string('code_hash');
            // The cap that actually closes six digits. A throttle slows
            // guessing down; this ends it.
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->string('ip', 45)->nullable();
            $table->timestamp('sent_at');
            $table->timestamp('expires_at');
            $table->timestamp('consumed_at')->nullable();
            $table->timestamps();

            // The lookup every request makes.
            $table->index(['audience', 'email']);
            // What the prune walks.
            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sign_in_codes');
    }
};
