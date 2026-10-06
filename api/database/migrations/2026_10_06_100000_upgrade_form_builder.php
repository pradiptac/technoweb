<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The form builder upgrade (0.117.0, docs/forms.md).
 *
 * Four nullable columns and nothing else, so every form built before this
 * reads exactly as it did: a field with no `settings` and no `show_if` is a
 * field as it always was, a form with no `redirect_url` shows its success
 * message, and a submission with no `files` uploaded nothing.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('form_fields', function (Blueprint $table) {
            /*
             * What a kind needs beyond the common columns: a hidden field's
             * value, a number's or a date's bounds, what a file field accepts.
             * One JSON column rather than six nullable ones, because each kind
             * reads its own keys and no query filters on any of them.
             */
            $table->json('settings')->nullable()->after('options');
            /** `{field, op, value?}` — shown only when an earlier field answers so. */
            $table->json('show_if')->nullable()->after('settings');
        });

        Schema::table('forms', function (Blueprint $table) {
            // Where a visitor is sent after a successful submission, instead
            // of being shown the success message. A path or an http(s) URL.
            $table->string('redirect_url', 2048)->nullable()->after('success_message');
        });

        Schema::table('form_submissions', function (Blueprint $table) {
            /*
             * `{fieldName: {path, name, size, mime}}` for what was uploaded.
             * Beside `data` rather than inside it: `data` is what is emailed,
             * exported and sent to a webhook, and a stored path must never be
             * in any of those.
             */
            $table->json('files')->nullable()->after('data');
        });
    }

    public function down(): void
    {
        Schema::table('form_submissions', fn (Blueprint $table) => $table->dropColumn('files'));
        Schema::table('forms', fn (Blueprint $table) => $table->dropColumn('redirect_url'));
        Schema::table('form_fields', fn (Blueprint $table) => $table->dropColumn(['settings', 'show_if']));
    }
};
