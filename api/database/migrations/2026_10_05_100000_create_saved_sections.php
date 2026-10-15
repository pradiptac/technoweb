<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The section library (2026-10-05, docs/page-builder.md "The library"): a
 * section saved once and placed on many pages — linked, so an edit here
 * reaches every page, or copied — and page templates, a whole stack of
 * sections to start a new page from.
 *
 * One table for both, told apart by `kind`: a `section` holds exactly one
 * block, a `template` one to forty. `blocks` is the builder's own stored
 * shape, validated by the same rules a page's are.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('saved_sections', function (Blueprint $table) {
            $table->id();
            $table->string('kind', 16)->index();
            $table->string('name', 120);
            $table->string('description', 300)->nullable();
            $table->json('blocks');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('saved_sections');
    }
};
