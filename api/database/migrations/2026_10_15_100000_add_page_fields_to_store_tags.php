<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Shop tag landing pages (0.157.0, `docs/store.md` "Tags").
 *
 * A tag becomes a page at `/store/tags/{slug}`: a heading of its own and an
 * introduction (rich text, sanitised on write). The SEO override lives in
 * `seo_metadata` like every other record's, so there is nothing to add for it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('store_tags', function (Blueprint $table) {
            $table->string('heading', 160)->nullable()->after('slug');
            $table->text('intro')->nullable()->after('heading');
        });
    }

    public function down(): void
    {
        Schema::table('store_tags', function (Blueprint $table) {
            $table->dropColumn(['heading', 'intro']);
        });
    }
};
