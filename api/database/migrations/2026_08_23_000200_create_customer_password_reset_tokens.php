<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A reset-token table of its own for customers.
 *
 * Both brokers were pointed at `password_reset_tokens`, whose primary key is
 * the email address. Laravel finds a token row by email and then compares the
 * hash — so with one shared table, a token issued to a *customer* validates
 * against the *staff* account at the same address.
 *
 * Verified before writing this: requesting a customer reset and posting that
 * token to the staff broker returned PASSWORD_RESET and changed the staff
 * password. That is privilege escalation into the admin console, and it is
 * the same shape as the id collision between Customer and User that this
 * project has already been bitten by once. The two principals must not share
 * anything keyed on a value they both hold.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_password_reset_tokens');
    }
};
