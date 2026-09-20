<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `users` had no phone column at all — `SignInChannel`'s own doc comment
 * names this exact gap: SMS reports itself unavailable partly because "a
 * phone number on every account" did not exist to send one to.
 *
 * Nullable, because a migration cannot invent a number for every existing
 * staff row. `StoreUserRequest` is what makes it required going forward, for
 * every *new* account — the same split `add_registration_to_customers_table`
 * used for `status`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('phone', 32)->nullable()->after('email');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('phone');
        });
    }
};
