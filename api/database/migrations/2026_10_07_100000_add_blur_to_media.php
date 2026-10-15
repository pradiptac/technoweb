<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A blurred preview of each library picture (0.123.0, docs/media.md).
 *
 * `blur` holds a twelve-pixel-wide WebP as a `data:` URL — a couple of
 * hundred characters — which the public site paints behind a picture until
 * the real one arrives. Three states, and the difference matters to the
 * backfill: null is "not made yet", an empty string is "tried, and there is
 * nothing to make" (a vector, a file GD cannot read), anything else is the
 * preview.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('media', function (Blueprint $table) {
            $table->text('blur')->nullable()->after('focal_y');
        });
    }

    public function down(): void
    {
        Schema::table('media', function (Blueprint $table) {
            $table->dropColumn('blur');
        });
    }
};
