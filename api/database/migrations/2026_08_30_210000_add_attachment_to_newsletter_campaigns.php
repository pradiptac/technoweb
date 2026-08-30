<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One attachment per campaign.
 *
 * **One, deliberately.** A newsletter carrying several files is a newsletter
 * that is mostly attachments, and every megabyte is multiplied by the size of
 * the list — a 4MB brochure to ten thousand people is forty gigabytes through
 * the relay, and most providers meter exactly that. A price list or a brochure
 * is the real case, and it is one file.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('newsletter_campaigns', function (Blueprint $table) {
            // The path on the public disk — the media library's own, so an
            // attachment is a file somebody can find, reuse and delete rather
            // than a copy hidden inside one campaign.
            $table->string('attachment_path')->nullable()->after('text_content');

            /*
             * The name the recipient sees, stored separately from the path.
             *
             * Media filenames are hashed, so attaching the file under its
             * stored name delivers `a8f3c1…pdf` to somebody's downloads
             * folder. The human name is metadata on the media row and is
             * copied here, because the row can be renamed or deleted later and
             * what was sent must not change afterwards.
             */
            $table->string('attachment_name')->nullable()->after('attachment_path');
            $table->unsignedInteger('attachment_bytes')->nullable()->after('attachment_name');
        });
    }

    public function down(): void
    {
        Schema::table('newsletter_campaigns', function (Blueprint $table) {
            $table->dropColumn(['attachment_path', 'attachment_name', 'attachment_bytes']);
        });
    }
};
