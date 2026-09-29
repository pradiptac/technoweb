<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Backups and restores. See `docs/backups.md`.
 *
 * **No foreign key leaves these three tables.** A restore drops and rebuilds
 * every other table — `users` included — while these are preserved, so a
 * constraint from `backups.created_by` to `users.id` would either refuse the
 * drop or point at a user the backup never had. The ids are kept as plain
 * numbers, and the names beside them are copied, the activity log's rule.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('backups', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            // full | incremental
            $table->string('type', 16);
            // schedule | manual | pre_restore | pre_update
            $table->string('trigger', 16);
            // pending, dumping, indexing, archiving, uploading, completed, completed_with_errors, failed, cancelled
            $table->string('status', 24)->index();
            // The chain: the full an incremental builds on, and the backup just before it.
            $table->unsignedBigInteger('base_id')->nullable()->index();
            $table->unsignedBigInteger('parent_id')->nullable();
            // The folder name on every destination.
            $table->string('folder', 80);
            // What this run covers, and where it goes.
            $table->json('includes');
            $table->json('destinations');
            $table->json('progress')->nullable();
            // mysqldump | php
            $table->string('dumper', 16)->nullable();
            $table->unsignedBigInteger('db_bytes')->nullable();
            $table->unsignedInteger('file_count')->default(0);
            $table->unsignedBigInteger('files_bytes')->default(0);
            $table->unsignedInteger('deleted_count')->default(0);
            // [{name, size, sha256}] — the manifest's own list.
            $table->json('files')->nullable();
            $table->unsignedBigInteger('total_bytes')->default(0);
            // The newest migration this database had, for a restore to compare.
            $table->string('schema', 191)->nullable();
            $table->text('error')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->string('created_by_name')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            // Set when the staging copy on this server was removed.
            $table->timestamp('local_deleted_at')->nullable();
            $table->timestamps();
        });

        Schema::create('backup_uploads', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('backup_id')->index();
            $table->string('destination', 16);
            $table->string('file', 80);
            $table->unsignedBigInteger('size')->default(0);
            // pending | uploading | done | failed
            $table->string('status', 16);
            $table->unsignedBigInteger('bytes_sent')->default(0);
            // A destination's own resume state: an upload id and parts, a session URI.
            $table->json('state')->nullable();
            $table->text('error')->nullable();
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->unique(['backup_id', 'destination', 'file']);
        });

        Schema::create('backup_restores', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('backup_id')->nullable();
            // {kind: local|remote, destination?, folder}
            $table->json('source');
            // [{folder, manifest}] full first
            $table->json('chain')->nullable();
            // database | files | both
            $table->string('scope', 16);
            $table->boolean('prune_missing')->default(false);
            // pending, safety, downloading, importing, files, finishing, completed, failed, cancelled
            $table->string('status', 24)->index();
            $table->json('progress')->nullable();
            $table->unsignedBigInteger('safety_backup_id')->nullable();
            $table->text('error')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->string('created_by_name')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('backup_restores');
        Schema::dropIfExists('backup_uploads');
        Schema::dropIfExists('backups');
    }
};
