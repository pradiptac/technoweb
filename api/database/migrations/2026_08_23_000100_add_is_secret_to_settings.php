<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Marks a setting as holding a credential.
 *
 * The settings table now carries an SMTP password and an API key alongside
 * the phone number and the footer copy, and those cannot be treated the same
 * way: they are encrypted at rest, never returned to the browser, and their
 * groups are excluded from the public endpoint.
 *
 * A column rather than a naming convention — deciding "is this a secret?" by
 * matching on the key name is one typo away from leaking one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            $table->boolean('is_secret')->default(false)->after('type');
        });
    }

    public function down(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            $table->dropColumn('is_secret');
        });
    }
};
