<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How many times a library file's bytes have been changed in place
 * (0.124.0, docs/cdn.md).
 *
 * An edit keeps the file's address on purpose — it is what lets a crop reach
 * every page already using the picture — and that address is cached for a
 * year by the browser, by the image optimiser and by any CDN in front of
 * either. `revision` is what the public URL is versioned by (`?v=3`), so the
 * address changes exactly when the bytes do and never otherwise: a file
 * nobody has edited stays at zero and its URL stays as it was.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('media', function (Blueprint $table) {
            $table->unsignedInteger('revision')->default(0)->after('blur');
        });
    }

    public function down(): void
    {
        Schema::table('media', function (Blueprint $table) {
            $table->dropColumn('revision');
        });
    }
};
