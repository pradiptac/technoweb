<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * How a slide's words arrive — see `App\Enums\SlideCaptionAnimation`.
 * Defaulted to `none`: the words used to appear with the picture, and every
 * existing slider keeps doing exactly that the moment this runs.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sliders', function (Blueprint $table) {
            $table->string('caption_animation', 20)->default('none')->after('transition');
        });
    }

    public function down(): void
    {
        Schema::table('sliders', function (Blueprint $table) {
            $table->dropColumn('caption_animation');
        });
    }
};
