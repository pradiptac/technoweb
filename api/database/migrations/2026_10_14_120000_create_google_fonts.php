<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Google fonts copied to this server (0.179.0, docs/theming.md "Google
 * fonts"): one row per installed family, its faces as a JSON list of
 * `{weight, range, path}` — a list, because JSON objects do not keep order.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('google_fonts', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 62)->unique();
            $table->string('family', 120);
            $table->string('category', 30);
            $table->json('faces');
            $table->unsignedInteger('bytes')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('google_fonts');
    }
};
