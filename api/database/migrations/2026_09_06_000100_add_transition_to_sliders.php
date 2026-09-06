<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How one slide gives way to the next — see `App\Enums\SliderTransition`.
 *
 * Defaulted to `slide`, not `fade` as the equivalent gallery migration chose.
 * A gallery with no transition previously had none at all, so defaulting
 * every existing row to `fade` was an upgrade nobody had to ask for. A
 * slider's existing behaviour already *is* a slide — a real scrollable strip,
 * swipeable and reachable by keyboard with no JavaScript — and defaulting
 * anywhere else would silently change what every slider on every existing
 * install does the moment this ran, including the homepage hero.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sliders', function (Blueprint $table) {
            $table->string('transition', 20)->default('slide')->after('interval_ms');
        });
    }

    public function down(): void
    {
        Schema::table('sliders', function (Blueprint $table) {
            $table->dropColumn('transition');
        });
    }
};
