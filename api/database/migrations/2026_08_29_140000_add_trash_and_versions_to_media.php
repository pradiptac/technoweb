<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A bin for deleted files, and a history for edited ones.
 *
 * **Trash.** Deleting a file used to remove the bytes immediately, and the
 * dialog had to admit it could not say what would break — nothing in this
 * product tracks which records reference a path. That is exactly the situation
 * a bin is for: the mistake is discovered by somebody visiting a page and
 * finding a hole in it, which is minutes or days later, and until now there was
 * no way back. Soft-deleting keeps the row *and the file*, so a restore is a
 * column change and the URL that was already published starts working again.
 *
 * **Versions.** Every editing endpoint rewrites the file in place, because the
 * path is the identity records store — which is right, and means an edit is
 * destructive with no undo. A version row copies the *previous* bytes aside
 * before each edit, so "rotate, look, rotate back" stops being the only
 * recovery and a crop taken too tight is recoverable.
 *
 * Versions are their own table rather than a JSON column on `media` because
 * each one owns a file on disk that has to be deleted when it is pruned or
 * when its parent is destroyed — a relation the database can enforce, rather
 * than an array something has to remember to walk.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('media', function (Blueprint $table) {
            $table->softDeletes();
            // Trashed files are listed newest-first and pruned by age, and the
            // index is what keeps both off a full scan once the bin is large.
            $table->index('deleted_at');
        });

        Schema::create('media_versions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('media_id')->constrained('media')->cascadeOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('disk', 32)->default('public');
            // The superseded bytes, under their own hashed name. Never the
            // live path — that one still belongs to the current version.
            $table->string('path');
            $table->string('mime', 120);
            $table->unsignedBigInteger('size');
            $table->unsignedInteger('width')->nullable();
            $table->unsignedInteger('height')->nullable();
            // What produced this version, for a history somebody can read:
            // "rotate", "crop", "resize", "replace".
            $table->string('operation', 32)->nullable();
            $table->timestamps();

            $table->index(['media_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('media_versions');

        Schema::table('media', function (Blueprint $table) {
            $table->dropIndex(['deleted_at']);
            $table->dropSoftDeletes();
        });
    }
};
