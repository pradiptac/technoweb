<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Three things an editor could not decide about a system email: whether it
 * goes at all, who else gets a copy, and who it comes from.
 *
 * **`sends` is a second switch beside `is_enabled`, and the two mean different
 * things.** `is_enabled` was there first and means "use my wording" — false
 * puts the built-in text back and the message still goes. `sends` means "send
 * this message" — false and nobody receives it. They are named so a reader
 * cannot take one for the other, and the console labels them as two sentences.
 *
 * **`cc` and `bcc` are JSON arrays, never the comma-separated string the
 * console collects.** The split and the per-address check happen on write,
 * where a bad address is a 422 somebody sees; parsed at send time it would be
 * a delivery that fails in a queue job with nothing on screen.
 *
 * **`from_name` and `from_email` are the campaign's two columns** at the same
 * lengths, and null means the global sender. Nothing here can verify that an
 * address is one the provider is authorised to send as — that is SPF and DKIM
 * at the provider — so the field is offered with the warning, exactly as the
 * campaign's is.
 *
 * A row can now exist with no wording in it: a message switched off, or
 * copied, with the built-in text. `isUsable()` already treats blank wording as
 * "use the built-in", so nothing about rendering changes — but "customised"
 * stops meaning "a row exists", and reset stops meaning "delete the row".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mail_templates', function (Blueprint $table) {
            $table->boolean('sends')->default(true)->after('is_enabled');
            $table->json('cc')->nullable()->after('sends');
            $table->json('bcc')->nullable()->after('cc');
            $table->string('from_name', 120)->nullable()->after('bcc');
            $table->string('from_email', 190)->nullable()->after('from_name');
        });
    }

    public function down(): void
    {
        Schema::table('mail_templates', function (Blueprint $table) {
            $table->dropColumn(['sends', 'cc', 'bcc', 'from_name', 'from_email']);
        });
    }
};
