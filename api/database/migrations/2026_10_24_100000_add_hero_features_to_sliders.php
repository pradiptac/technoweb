<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Hero slider features (0.191.0): a second button, a kicker, a phone picture,
 * text tone, overlay strength, per-slide timing and fit on a slide; slow zoom,
 * navigation and height on a slider. Every default is today's behaviour, so an
 * untouched slider renders as before.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('slides', function (Blueprint $table) {
            $table->string('kicker', 60)->nullable();
            $table->string('link2_url', 2048)->nullable();
            $table->string('link2_label', 60)->nullable();
            $table->string('mobile_media_path')->nullable();
            $table->string('text_tone', 10)->default('light');
            $table->string('overlay', 10)->default('standard');
            $table->unsignedInteger('duration_ms')->nullable();
            $table->string('fit', 10)->default('cover');
        });

        Schema::table('sliders', function (Blueprint $table) {
            $table->string('media_effect', 20)->default('none');
            $table->string('navigation', 20)->default('dots');
            $table->string('height', 20)->default('theme');
            $table->string('height_mobile', 10)->nullable();
            $table->string('height_desktop', 10)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('slides', function (Blueprint $table) {
            $table->dropColumn(['kicker', 'link2_url', 'link2_label', 'mobile_media_path', 'text_tone', 'overlay', 'duration_ms', 'fit']);
        });

        Schema::table('sliders', function (Blueprint $table) {
            $table->dropColumn(['media_effect', 'navigation', 'height', 'height_mobile', 'height_desktop']);
        });
    }
};
