<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Page templates are filed under a category (0.162.0, docs/page-builder.md
 * "The library"): one of `SavedSection::CATEGORIES`, null for a template filed
 * under none and for every section, which has no use for one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('saved_sections', function (Blueprint $table) {
            $table->string('category', 24)->nullable()->after('description')->index();
        });
    }

    public function down(): void
    {
        Schema::table('saved_sections', function (Blueprint $table) {
            $table->dropIndex(['category']);
            $table->dropColumn('category');
        });
    }
};
