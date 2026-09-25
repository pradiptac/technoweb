<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Content blocks (the client, 2026-09-24): CTA banners, stat bars, pricing
 * tables and technology stacks — named, slugged sections an editor builds in
 * the console and places with a shortcode (`[cta slug="…"]`) or, for one CTA,
 * as the site's default closing band.
 *
 * One table with a `type`, not four: all four are the same shape — a name, a
 * slug that is a shortcode's contract, a layout, a status and structured
 * content — and four tables would be four copies of the same CRUD. The
 * content is `data`, JSON holding **lists** wherever order matters, because
 * MySQL reorders JSON object keys (the reason `App\Casts\SpecSheet` exists).
 * Each layout's rules for `data` live in `App\Support\Blocks\BlockRules`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('content_blocks', function (Blueprint $table) {
            $table->id();
            $table->string('type', 20)->index();
            $table->string('layout', 40);
            $table->string('name', 150);
            // The shortcode's contract: renaming it breaks every body that embeds it.
            $table->string('slug', 160)->unique();
            $table->string('status', 20)->default('draft')->index();
            // One CTA may be the site's default closing band; the model keeps it to one.
            $table->boolean('is_default')->default(false);
            $table->json('data')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_blocks');
    }
};
