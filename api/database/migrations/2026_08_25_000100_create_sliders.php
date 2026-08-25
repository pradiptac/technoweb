<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sliders', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            // The shortcode addresses a slider by slug — [slider slug="hero"] —
            // so this is a URL-style contract even though a slider has no URL.
            // Renaming one breaks every body that embeds it.
            $table->string('slug')->unique();
            $table->string('status')->default('published')->index();
            $table->boolean('autoplay')->default(true);
            // Milliseconds. Nullable would mean "some default somewhere else";
            // a column with a value is one place to look.
            $table->unsignedSmallInteger('interval_ms')->default(6000);
            $table->timestamps();
        });

        Schema::create('slides', function (Blueprint $table) {
            $table->id();
            $table->foreignId('slider_id')->constrained()->cascadeOnDelete();
            // image | video. Two shapes rather than one nullable-everything
            // row: a video needs a poster and an image never does.
            $table->string('kind')->default('image');
            $table->string('media_path');
            // Shown before a video plays, and the only thing a browser that
            // refuses to autoplay will ever show.
            $table->string('poster_path')->nullable();
            $table->string('alt_text')->nullable();
            $table->string('heading')->nullable();
            $table->string('caption', 500)->nullable();
            $table->string('link_url')->nullable();
            $table->string('link_label')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['slider_id', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('slides');
        Schema::dropIfExists('sliders');
    }
};
