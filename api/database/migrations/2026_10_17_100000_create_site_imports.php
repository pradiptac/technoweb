<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Imports of a website with no API (0.163.0, docs/site-import.md): a live
 * URL read page by page, or an uploaded ZIP of its files.
 *
 * The lifecycle is `wordpress_imports`': `pending → scanning → analysing →
 * ready → running → completed`, with `failed`, `cancelled` and `expired` the
 * ways out. `source` is `url` or `zip`; `site_url` the start address (or the
 * ZIP's name) and `site` a hash of it, which keys the import map so a second
 * import of the same site updates rather than copies. The map itself is
 * `wordpress_import_map` — it is keyed by that hash and needs no table of its
 * own. `settings` is what was asked for (depth, page limit); `zip_path` is the
 * upload on the private disk.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('site_imports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('source', 8)->default('url');
            $table->string('site_url', 255);
            $table->char('site', 40)->index();
            $table->string('zip_path', 255)->nullable();
            $table->string('status', 20)->default('pending');
            $table->json('sections')->nullable();
            $table->json('settings')->nullable();
            $table->json('decisions')->nullable();
            $table->json('progress')->nullable();
            $table->json('analysis')->nullable();
            $table->json('counts')->nullable();
            $table->json('problems')->nullable();
            $table->string('error', 500)->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'updated_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('site_imports');
    }
};
