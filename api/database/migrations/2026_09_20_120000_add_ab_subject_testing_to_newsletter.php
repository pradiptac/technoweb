<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A/B subject testing.
 *
 * A campaign may carry a second subject line. On send, a slice of the frozen
 * audience (`ab_test_percent`) goes out at once, half with each subject; the
 * rest is *held* — recipient status `held`, which the batch dispatcher does
 * not pick up — until `ab_wait_hours` have passed, when the subject with the
 * better open rate is stamped as `ab_winner` and the held rows go out with
 * it. `variant` on the recipient is which subject that person received; the
 * report reads opens per variant off it.
 *
 * Nullable throughout: a campaign with no `subject_b` is exactly the campaign
 * it was, and every existing row means "no test".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('newsletter_campaigns', function (Blueprint $table) {
            $table->string('subject_b', 190)->nullable()->after('subject');
            $table->unsignedTinyInteger('ab_test_percent')->nullable()->after('subject_b');
            $table->unsignedTinyInteger('ab_wait_hours')->nullable()->after('ab_test_percent');
            $table->string('ab_winner', 1)->nullable()->after('ab_wait_hours');
            $table->timestamp('ab_decided_at')->nullable()->after('ab_winner');
        });

        Schema::table('newsletter_campaign_recipients', function (Blueprint $table) {
            $table->string('variant', 1)->nullable()->after('status');
            $table->index(['newsletter_campaign_id', 'variant'], 'newsletter_recipients_variant');
        });
    }

    public function down(): void
    {
        Schema::table('newsletter_campaign_recipients', function (Blueprint $table) {
            $table->dropIndex('newsletter_recipients_variant');
            $table->dropColumn('variant');
        });

        Schema::table('newsletter_campaigns', function (Blueprint $table) {
            $table->dropColumn(['subject_b', 'ab_test_percent', 'ab_wait_hours', 'ab_winner', 'ab_decided_at']);
        });
    }
};
