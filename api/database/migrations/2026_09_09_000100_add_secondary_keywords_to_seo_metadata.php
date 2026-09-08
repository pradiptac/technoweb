<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Secondary keywords, beside the single focus keyword.
 *
 * A JSON **array**, not an object and not a comma-separated string.
 *
 * Not an object because MySQL's JSON type normalises object keys by length and
 * then alphabetically — the trap `App\Casts\SpecSheet` exists for, which came
 * from a product spec sheet coming back in an order nobody chose. Arrays are
 * order-preserving, and the order here is the editor's: the first one they
 * typed is the one they care most about.
 *
 * Not a string because splitting a delimiter is a decision that then has to be
 * made identically in the request, the resource, the scorer and the console,
 * and one of those four eventually splits on the wrong character.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('seo_metadata', function (Blueprint $table) {
            $table->json('secondary_keywords')->nullable()->after('focus_keyword');
        });
    }

    public function down(): void
    {
        Schema::table('seo_metadata', function (Blueprint $table) {
            $table->dropColumn('secondary_keywords');
        });
    }
};
