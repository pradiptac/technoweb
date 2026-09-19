<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A newsletter import can now come from a mailbox as well as a file.
 *
 * A mailbox scan is a long, sliced, queued job whose result is reviewed
 * before it is committed, so the import row has to carry state a file
 * import never needed: where the scan has got to (`progress`), what it found
 * (`analysis`, the same dry-run block the CSV wizard shows), the private-disk
 * path of the file it wrote (`file`), why it stopped (`error`), and when an
 * un-committed result is thrown away (`expires_at`). `excluded` counts what
 * the domain and role filters left out at commit — a decision, not a
 * problem, so it is a count rather than rows in `newsletter_import_rows`.
 *
 * `source` defaults to `file`, so every existing row keeps its meaning.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('newsletter_imports', function (Blueprint $table) {
            $table->string('source', 20)->default('file')->after('filename');
            $table->string('file')->nullable()->after('source');
            $table->json('progress')->nullable()->after('mapping');
            $table->json('analysis')->nullable()->after('progress');
            $table->unsignedInteger('excluded')->default(0)->after('suppressed');
            $table->string('error', 500)->nullable()->after('excluded');
            $table->timestamp('expires_at')->nullable()->after('error');

            $table->index(['source', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('newsletter_imports', function (Blueprint $table) {
            $table->dropIndex(['source', 'status']);
            $table->dropColumn(['source', 'file', 'progress', 'analysis', 'excluded', 'error', 'expires_at']);
        });
    }
};
