<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A small status chip beside a menu entry — LIVE, BETA, SOON, NEW.
 *
 * `badge` is plain text, stored as typed and drawn upper-case by the frontend
 * (so an editor's "Beta" and "BETA" are one thing on the page and neither is
 * rewritten in the database). `badge_tone` is a short id, checked against
 * `MenuItem::BADGE_TONES`; the colour behind each is a design token on the
 * frontend, never stored. Additive and nullable (the tone defaults), so it
 * applies to a live table without touching a row.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('menu_items', function (Blueprint $table) {
            $table->string('badge', 12)->nullable()->after('description');
            $table->string('badge_tone', 8)->default('new')->after('badge');
        });
    }

    public function down(): void
    {
        Schema::table('menu_items', function (Blueprint $table) {
            $table->dropColumn(['badge', 'badge_tone']);
        });
    }
};
