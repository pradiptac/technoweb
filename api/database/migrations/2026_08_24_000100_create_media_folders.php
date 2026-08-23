<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Folders for the media library.
 *
 * Flat, not a tree. The library is a place to find an image again, and a
 * nesting depth brings reparenting rules, cycle checks and a breadcrumb for
 * no benefit anyone asked for. If it ever needs depth, a nullable parent_id
 * is an additive migration.
 *
 * media.folder_id is nullOnDelete on purpose: deleting a folder returns its
 * images to the unfiled view rather than destroying them. Files are the
 * expensive thing here — a folder is just a label, and losing a hundred
 * uploads to one confirmation dialog is not a recoverable mistake.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('media_folders', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique('name');
        });

        Schema::table('media', function (Blueprint $table) {
            $table->foreignId('folder_id')
                ->nullable()
                ->after('uploaded_by')
                ->constrained('media_folders')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('media', function (Blueprint $table) {
            $table->dropConstrainedForeignId('folder_id');
        });

        Schema::dropIfExists('media_folders');
    }
};
