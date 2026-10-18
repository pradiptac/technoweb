<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Semantic search (0.182.0, docs/semantic-search.md): passages and cached query vectors. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('search_passages', function (Blueprint $table) {
            $table->id();
            $table->string('subject_type', 40);
            $table->unsignedBigInteger('subject_id');
            $table->unsignedSmallInteger('position');
            $table->string('heading', 160)->nullable();
            $table->text('text');
            $table->char('hash', 40);
            $table->string('model', 100)->nullable();
            $table->binary('vector')->nullable();
            $table->timestamp('embedded_at')->nullable();
            $table->timestamps();
            $table->unique(['subject_type', 'subject_id', 'position'], 'search_passages_subject_position');
            $table->index(['model', 'embedded_at']);
        });

        Schema::create('search_query_vectors', function (Blueprint $table) {
            $table->char('hash', 40)->primary();
            $table->string('model', 100);
            $table->binary('vector');
            $table->timestamp('last_used_at')->index();
        });

        // A 512-float vector is 2 KB; MySQL's BLOB holds 64 KB, so `binary()` (BLOB) is enough
        // for any model up to 16,000 dimensions. Nothing to widen.
    }

    public function down(): void
    {
        Schema::dropIfExists('search_query_vectors');
        Schema::dropIfExists('search_passages');
    }
};
