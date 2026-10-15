<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The downloads centre (0.131.0, docs/downloads.md): drivers, datasheets and
 * firmware, filed by category and attachable to catalogue and shop products.
 *
 * A download's file is one of two things and the columns say which: a file
 * the media library already holds (`file_path`, a public address), or one
 * uploaded here to the **private** disk (`private_path`, no address at all —
 * streamed by a route that can ask who is reading). Only the second can be
 * restricted to customers.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('download_categories', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->string('slug', 140)->unique();
            $table->string('description', 500)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('downloads', function (Blueprint $table) {
            $table->id();
            // A category deleted leaves its files unfiled, the rule a
            // service category follows.
            $table->foreignId('download_category_id')->nullable()->constrained('download_categories')->nullOnDelete();
            $table->string('title', 160);
            $table->string('summary', 500)->nullable();
            $table->string('version', 40)->nullable();
            $table->date('released_on')->nullable();
            $table->string('access', 16)->default('public');
            $table->string('source', 16)->default('library');
            $table->string('file_path')->nullable();
            $table->string('private_path')->nullable();
            // The upload's own name, size and type, copied at upload: a
            // private file has no media row to read them from.
            $table->string('file_name', 180)->nullable();
            $table->unsignedBigInteger('file_size')->nullable();
            $table->string('file_mime', 120)->nullable();
            $table->string('status', 16)->default('draft');
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->unsignedBigInteger('download_count')->default(0);
            $table->timestamps();

            $table->index(['status', 'download_category_id']);
            $table->index(['status', 'access']);
        });

        Schema::create('downloadables', function (Blueprint $table) {
            $table->id();
            $table->foreignId('download_id')->constrained('downloads')->cascadeOnDelete();
            // The morph alias (`product`, `store_product`), never a class name.
            $table->string('downloadable_type', 40);
            $table->unsignedBigInteger('downloadable_id');

            $table->unique(['download_id', 'downloadable_type', 'downloadable_id'], 'downloadables_unique');
            $table->index(['downloadable_type', 'downloadable_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('downloadables');
        Schema::dropIfExists('downloads');
        Schema::dropIfExists('download_categories');
    }
};
