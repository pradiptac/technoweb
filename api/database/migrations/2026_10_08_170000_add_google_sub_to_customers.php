<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Google sign-in for customers (0.133.0, docs/auth.md "Signing in with
 * Google").
 *
 * `google_sub` is Google's own identifier for the account that signed in —
 * the `sub` claim, which Google documents as the one value that never
 * changes; an address can. Unique, so one Google account is one customer,
 * and nullable, because most customers will never use it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('google_sub', 64)->nullable()->unique()->after('email');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropUnique(['google_sub']);
            $table->dropColumn('google_sub');
        });
    }
};
