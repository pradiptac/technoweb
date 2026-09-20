<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Resending to non-openers.
 *
 * A resend is an ordinary campaign row pointing at the one it was copied from,
 * so it has a report, a health check and tracking of its own. `resend_of_id`
 * is **unique**, and that is the whole of "one resend per campaign": two
 * requests racing to resend the same campaign cannot both insert, whatever
 * either read a moment earlier — the same shape as the recipient index being
 * the guard against sending twice. MySQL allows any number of nulls in a
 * unique column, so every ordinary campaign is unaffected.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('newsletter_campaigns', function (Blueprint $table) {
            $table->foreignId('resend_of_id')->nullable()->after('newsletter_template_id')
                ->constrained('newsletter_campaigns')->nullOnDelete();
            $table->unique('resend_of_id', 'newsletter_campaigns_resend_of_unique');
        });
    }

    public function down(): void
    {
        Schema::table('newsletter_campaigns', function (Blueprint $table) {
            $table->dropForeign(['resend_of_id']);
            $table->dropUnique('newsletter_campaigns_resend_of_unique');
            $table->dropColumn('resend_of_id');
        });
    }
};
