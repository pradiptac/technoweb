<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Both defaults are the behaviour that already ships, deliberately: a slider
 * has always been a full-width banner with its caption in the bottom-left, so
 * every existing row keeps rendering exactly as it does today the moment this
 * runs. See the notes on both enums.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sliders', function (Blueprint $table) {
            $table->string('layout', 10)->default('full')->after('transition');
        });

        Schema::table('slides', function (Blueprint $table) {
            $table->string('caption_position', 20)->default('bottom-left')->after('link_label');
        });
    }

    public function down(): void
    {
        Schema::table('sliders', function (Blueprint $table) {
            $table->dropColumn('layout');
        });

        Schema::table('slides', function (Blueprint $table) {
            $table->dropColumn('caption_position');
        });
    }
};
